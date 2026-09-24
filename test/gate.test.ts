import { test } from "node:test";
import assert from "node:assert/strict";
import { escalate, type Judge } from "../src/gate.js";
import type { FindingDraft, Gate } from "../src/jev.js";

const f: FindingDraft = { title: "t", claim: "c", evidence: ["a.txt:1"], confidence: "high" };
const sources = [{ ref: "a.txt:1", text: "1\tc" }];
const fixed = (g: Gate): Judge => async () => g;
const counting = (g: Gate) => {
  const calls: number[] = [];
  return { calls, judge: (async () => (calls.push(1), g)) as Judge };
};

const sure: Gate = { ok: true, reasons: [], confidence: "high", review: [], scores: { support: 0.95, certainty: 0.9 } };
const unsure: Gate = { ok: true, reasons: [], confidence: "medium", review: ["gate unsure (0.65)"], scores: { support: 0.65, certainty: 0.9 } };
const rejected: Gate = { ok: false, reasons: ["not supported"], confidence: "low", review: [] };

test("a sure pass or a rejection never reaches the second judge", async () => {
  const second = counting(rejected);
  assert.deepEqual(await escalate(fixed(sure), second.judge, "llm")(f, sources), sure);
  assert.deepEqual(await escalate(fixed(rejected), second.judge, "llm")(f, sources), rejected);
  assert.equal(second.calls.length, 0);
});

test("an unsure pass confirmed by the second judge loses its review note", async () => {
  const g = await escalate(fixed(unsure), fixed(sure), "llm")(f, sources);
  assert.deepEqual([g.ok, g.review, g.checkedBy, g.confidence], [true, [], "llm", "medium"]);
});

test("an unsure pass the second judge rejects is rejected with its reason", async () => {
  const g = await escalate(fixed(unsure), fixed({ ...rejected, reasons: ["1 / 0.042 is about 24"] }), "llm")(f, sources);
  assert.deepEqual([g.ok, g.reasons, g.checkedBy, g.scores], [false, ["1 / 0.042 is about 24"], "llm", unsure.scores]);
});
