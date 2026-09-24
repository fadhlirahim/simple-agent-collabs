import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPost, nextN, parseBoard, withSummary, type Post } from "../src/board.js";

const sample = `# Board

## Summary

Nothing yet.

## Posts

### [R1-1] CLAIM · Check API limits
- Thread: T1

### [R2-1] FINDING · Jev caps input at 64K
- Thread: T2
- Claim: Jev input is 64K tokens total
- Evidence: https://docs.typesafe.ai/primitives
- Evidence: SDK README
- Confidence: high
- Next: none

### [R1-2] QUESTION · Does routing need the goal?
- To: @R2
- Q: Should the tier router see the full goal?
`;

test("parses summary and posts with repeated fields", () => {
  const b = parseBoard(sample);
  assert.equal(b.summary, "Nothing yet.");
  assert.equal(b.posts.length, 3);
  assert.deepEqual(b.posts[1].fields.Evidence, ["https://docs.typesafe.ai/primitives", "SDK README"]);
  assert.equal(b.posts[2].type, "QUESTION");
  assert.equal(b.posts[2].title, "Does routing need the goal?");
});

test("nextN counts per author", () => {
  const { posts } = parseBoard(sample);
  assert.equal(nextN(posts, "R1"), 3);
  assert.equal(nextN(posts, "R2"), 2);
  assert.equal(nextN(posts, "R3"), 1);
});

test("formatPost round-trips", () => {
  const p: Post = { author: "R3", n: 1, type: "FINDING", title: "X", fields: { Claim: ["a\nb"], Evidence: ["e1", "e2"] } };
  const back = parseBoard("## Posts\n" + formatPost(p)).posts[0];
  assert.deepEqual(back, { ...p, fields: { Claim: ["a b"], Evidence: ["e1", "e2"] } });
});

test("withSummary replaces only the summary body", () => {
  const out = withSummary(sample, "New summary.");
  assert.match(out, /## Summary\n\nNew summary\.\n\n## Posts/);
  assert.equal(parseBoard(out).posts.length, 3);
});
