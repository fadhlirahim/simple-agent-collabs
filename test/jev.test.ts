import { test } from "node:test";
import assert from "node:assert/strict";
import { createJev, type FindingDraft } from "../src/jev.js";

const draft: FindingDraft = { title: "t", claim: "c", evidence: ["a.txt:1"], confidence: "high" };
const sources = [{ ref: "a.txt:1", text: "1\tc" }];

// Fake client that answers with the given support probability and confidence label.
const gateWith = (support: number, choice: "high" | "medium" | "low", certainty: number) =>
  createJev({ systemOne: async () => ({ answers: { supports: { noul: support }, confidence: { choice, confidence: certainty } } }) } as any);

test("clear support passes with Jev's label and no review", async () => {
  const g = await gateWith(0.95, "medium", 0.9).gateFinding(draft, sources);
  assert.deepEqual(g, { ok: true, reasons: [], confidence: "medium", review: [], scores: { support: 0.95, certainty: 0.9 } });
});

test("weak support is rejected", async () => {
  const g = await gateWith(0.3, "high", 0.9).gateFinding(draft, sources);
  assert.equal(g.ok, false);
});

test("middling support passes with a review note", async () => {
  const g = await gateWith(0.65, "high", 0.9).gateFinding(draft, sources);
  assert.equal(g.ok, true);
  assert.match(g.review[0], /unsure the sources support the claim \(0\.65\)/);
});

test("an unsure label falls back to the lower of Jev's and the researcher's", async () => {
  const g = await gateWith(0.9, "high", 0.5).gateFinding({ ...draft, confidence: "medium" }, sources);
  assert.equal(g.confidence, "medium");
  assert.match(g.review[0], /unsure of the confidence level/);
});
