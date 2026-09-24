import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV3 } from "ai/test";
import { parseBoard } from "../src/board.js";
import { ConfigSchema } from "../src/config.js";
import { parseGoal, openItems } from "../src/goal.js";
import { passthrough, type Decider } from "../src/jev.js";
import { tick, type Ctx } from "../src/researcher.js";
import { makeTools } from "../src/tools.js";

const goal = parseGoal(`# Goal\n\nQ?\n\n## Threads\n\n- T1: one\n- T2: two\n`);

const finding = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ title: "t", claim: "c", evidence: ["src/x.ts:1"], confidence: "high", next: "none", question: null, ...over });

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const reply = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [] });

async function setup(model: MockLanguageModelV3, jev: Decider = passthrough) {
  const dir = await mkdtemp(join(tmpdir(), "sac-"));
  const boardFile = join(dir, "board.md");
  await writeFile(boardFile, "# Board\n\n## Summary\n\n## Posts\n");
  const config = ConfigSchema.parse({ tiers: { fast: "x/a", standard: "x/b", powerful: "x/c" }, maxSteps: 2 });
  const ctx: Ctx = { config, goal, boardFile, tools: makeTools([dir]), jev, model: () => model, log: () => {} };
  return { ctx, boardFile, board: async () => parseBoard(await readFile(boardFile, "utf8")) };
}

test("parallel researchers claim different threads", async () => {
  const { ctx, board } = await setup(new MockLanguageModelV3({ doGenerate: async () => reply(finding()) }));
  const results = await Promise.all([tick(ctx, "R1"), tick(ctx, "R2")]);
  assert.deepEqual(results, ["posted", "posted"]);
  const claims = (await board()).posts.filter((p) => p.type === "CLAIM").map((p) => p.fields.Thread![0]).sort();
  assert.deepEqual(claims, ["T1", "T2"]);
  assert.equal(await tick(ctx, "R1"), "idle");
});

test("gate rejects once, retry lands with Jev's confidence", async () => {
  let calls = 0;
  const jev: Decider = {
    ...passthrough,
    gateFinding: async () => (++calls === 1 ? { ok: false, reasons: ["no checkable reference in evidence"], confidence: "low" } : { ok: true, reasons: [], confidence: "medium" }),
  };
  const model = new MockLanguageModelV3({ doGenerate: async () => reply(finding({ confidence: "high" })) });
  const { ctx, board } = await setup(model, jev);
  assert.equal(await tick(ctx, "R1"), "posted");
  assert.equal(model.doGenerateCalls.length, 2);
  const f = (await board()).posts.find((p) => p.type === "FINDING")!;
  assert.deepEqual(f.fields.Confidence, ["medium"]);
  assert.deepEqual(f.fields.StatedConfidence, ["high"]);
  assert.equal(f.fields.Gate, undefined);
});

test("model failure releases the thread", async () => {
  const model = new MockLanguageModelV3({ doGenerate: async () => { throw new Error("boom"); } });
  const { ctx, board } = await setup(model);
  assert.equal(await tick(ctx, "R1"), "error");
  const b = await board();
  const note = b.posts.find((p) => p.type === "NOTE")!;
  assert.deepEqual(note.fields.Release, ["T1"]);
  assert.deepEqual(openItems(goal, b.posts, "R2").map((i) => i.ref), ["T1", "T2"]);
});
