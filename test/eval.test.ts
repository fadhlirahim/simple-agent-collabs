import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MockLanguageModelV3 } from "ai/test";
import { checkEvidence, parseRefs } from "../src/evidence.js";
import { jevCitationsOnly, jevWithSources, llmWithSources, type Case } from "../src/eval/judges.js";
import { report, score, type Row } from "../src/eval/score.js";

const repo = join(import.meta.dirname, "..");
const cases: Case[] = JSON.parse(readFileSync(join(repo, "eval", "cases.json"), "utf8"));
const byId = (id: string) => cases.find((c) => c.id === id)!;

test("test set has 30 unique cases with valid labels", () => {
  assert.equal(cases.length, 30);
  assert.equal(new Set(cases.map((c) => c.id)).size, 30);
  for (const c of cases) assert.equal(c.label, c.kind === "correct" ? "pass" : "fail", c.id);
});

test("real citations resolve and fake ones do not", async () => {
  for (const c of cases) {
    const ev = await checkEvidence(c.evidence, [repo]);
    const refs = c.evidence.reduce((n, e) => n + parseRefs(e).files.length, 0);
    if (c.kind === "fake-citation") assert.ok(ev.missing.length > 0, `${c.id} should have a missing reference`);
    else {
      assert.deepEqual(ev.missing, [], c.id);
      assert.equal(ev.sources.length, refs, `${c.id} should read every cited range`);
    }
  }
});

const usage = { inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };
const reply = (json: object) => ({ content: [{ type: "text" as const, text: JSON.stringify(json) }], finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [] });

test("jev-sources: fake citation is decided by code, real one reaches Jev", async () => {
  let calls = 0;
  const client = {
    systemOne: async () => (calls++, { answers: { supports: { noul: 0.95 }, confidence: { choice: "high", confidence: 0.9 } }, usage: { input_tokens: 300, output_tokens: 0 } }),
  } as any;
  const judge = jevWithSources(client, [repo]);
  const fake = await judge.run(byId("F01"));
  assert.deepEqual([fake.pass, fake.stage, calls], [false, "code", 0]);
  const real = await judge.run(byId("C01"));
  assert.deepEqual([real.pass, real.stage, real.inputTokens, calls], [true, "judge", 300, 1]);
});

test("jev-citations never reads sources, so a fake citation can pass", async () => {
  const client = {
    systemOne: async () => ({ answers: { concrete: { noul: 0.9 }, supports: { noul: 0.8 }, confidence: { choice: "high" } }, usage: { input_tokens: 80, output_tokens: 0 } }),
  } as any;
  const r = await jevCitationsOnly(client).run(byId("F01"));
  assert.equal(r.pass, true);
});

test("llm judge sees the source text and its verdict is used", async () => {
  const model = new MockLanguageModelV3({ doGenerate: async () => reply({ supported: false, reason: "Source gives $0.042, not $0.42." }) });
  const r = await llmWithSources(model, [repo]).run(byId("W01"));
  assert.deepEqual([r.pass, r.stage, r.inputTokens, r.outputTokens], [false, "judge", 50, 10]);
  assert.match(JSON.stringify(model.doGenerateCalls[0].prompt), /Input costs \$0\.042 per million tokens/);
});

test("score counts false passes, review catches, and cost", () => {
  const run = (pass: boolean, review = false) => ({ pass, review, stage: "judge" as const, reason: "x", ms: 100, inputTokens: 1_000_000, outputTokens: 0 });
  const rows: Row[] = [
    { case: byId("C01"), runs: { j: run(true) } },
    { case: byId("W01"), runs: { j: run(true, true) } },
    { case: byId("X01"), runs: { j: run(false) } },
  ];
  const s = score(rows, "j", [0.042, 0]);
  assert.deepEqual([s.agree, s.total, s.falsePass, s.reviewCaught], [2, 3, ["W01"], ["W01"]]);
  assert.ok(Math.abs(s.costUsd - 0.126) < 1e-9);
  assert.match(report(rows, [s]), /\| Agrees with label \| 2\/3 \(67%\) \|/);
});
