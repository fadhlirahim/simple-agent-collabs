import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  JSON.stringify({ status: "answered", title: "t", claim: "c", evidence: ["src/x.ts:1"], confidence: "high", next: "none", question: null, ...over });

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const reply = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [] });

async function setup(model: MockLanguageModelV3, jev: Decider = passthrough) {
  const dir = await mkdtemp(join(tmpdir(), "sac-"));
  const boardFile = join(dir, "board.md");
  await writeFile(boardFile, "# Board\n\n## Summary\n\n## Posts\n");
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "x.ts"), "export const x = 1;\n");
  const config = ConfigSchema.parse({ tiers: { fast: "x/a", standard: "x/b", powerful: "x/c" }, maxSteps: 2 });
  const ctx: Ctx = { config, goal, boardFile, roots: [dir], tools: makeTools([dir]), jev, judge: jev.gateFinding, model: () => model, log: () => {} };
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
    gateFinding: async () =>
      ++calls === 1
        ? { ok: false, reasons: ["the cited sources do not support the claim as stated"], confidence: "low", review: [] }
        : { ok: true, reasons: [], confidence: "medium", review: [] },
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

test("blocked item is released and asks for help", async () => {
  const model = new MockLanguageModelV3({
    doGenerate: async () => reply(finding({ status: "blocked", claim: "needs T2 first", question: { to: "@ANY", text: "Who can do T2?" } })),
  });
  const { ctx, board } = await setup(model);
  assert.equal(await tick(ctx, "R1"), "posted");
  const b = await board();
  assert.equal(b.posts.some((p) => p.type === "FINDING"), false);
  assert.deepEqual(b.posts.find((p) => p.type === "NOTE")!.fields.Release, ["T1"]);
  assert.equal(b.posts.find((p) => p.type === "QUESTION")!.fields.Q![0], "Who can do T2?");
  assert.deepEqual(openItems(goal, b.posts, "R2").map((i) => i.ref), ["T1", "T2", "R1-3"]);
});

test("a cited line that does not exist is rejected before Jev runs", async () => {
  let jevCalls = 0;
  const jev: Decider = { ...passthrough, gateFinding: async (f) => (jevCalls++, passthrough.gateFinding(f, [])) };
  const model = new MockLanguageModelV3({ doGenerate: async () => reply(finding({ evidence: ["src/x.ts:40"] })) });
  const { ctx, board } = await setup(model, jev);
  assert.equal(await tick(ctx, "R1"), "posted");
  assert.equal(model.doGenerateCalls.length, 2);
  assert.equal(jevCalls, 0);
  const f = (await board()).posts.find((p) => p.type === "FINDING")!;
  assert.match(f.fields.Gate![0], /reference not found: src\/x\.ts:40 \(file has 2 lines\)/);
});
