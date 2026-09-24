import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoard } from "../src/board.js";
import { openItems, parseGoal } from "../src/goal.js";

const goal = parseGoal(`# Goal

Is Jev a good fit for gating agent findings?

## Threads

- T1: Input limits
- T2: Pricing
- T3: Latency

## Instructions

- Cite sources.
`);

test("parseGoal extracts question, threads, instructions", () => {
  assert.equal(goal.question, "Is Jev a good fit for gating agent findings?");
  assert.deepEqual(goal.threads.map((t) => t.id), ["T1", "T2", "T3"]);
  assert.equal(goal.instructions, "- Cite sources.");
});

test("openItems skips claimed threads and answered questions", () => {
  const { posts } = parseBoard(`## Posts
### [R1-1] CLAIM · Limits
- Thread: T1
### [R2-1] QUESTION · Pricing source?
- To: @ANY
- Q: Which page has pricing?
### [R2-2] QUESTION · Only for R2
- To: @R2
- Q: private
### [R1-2] NOTE · reply
- Re: R2-2
`);
  const items = openItems(goal, posts, "R1");
  assert.deepEqual(items.map((i) => i.ref), ["T2", "T3", "R2-1"]);
  assert.deepEqual(openItems(goal, posts, "R2").map((i) => i.ref), ["T2", "T3"]);
});
