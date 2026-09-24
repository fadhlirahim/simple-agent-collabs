import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkEvidence, focus, parseRefs } from "../src/evidence.js";

test("parseRefs finds URLs and file ranges, and ignores URL ports", () => {
  const r = parseRefs("src/tools.ts:27-40,69-84 and https://docs.typesafe.ai/models.md. Also http://x.com:8080/a");
  assert.deepEqual(r.urls, ["https://docs.typesafe.ai/models.md", "http://x.com:8080/a"]);
  assert.deepEqual(r.files, [{ path: "src/tools.ts", ranges: [[27, 40], [69, 84]] }]);
});

test("checkEvidence reads cited lines and flags what is missing or unreadable", async () => {
  const root = await mkdtemp(join(tmpdir(), "sac-ev-"));
  await writeFile(join(root, "a.txt"), Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n"));
  const ev = await checkEvidence(["a.txt:5 says line 5", "a.txt:50", "nope.txt:1", "http://localhost/x", "output: `ok 1`"], [root]);
  assert.equal(ev.hasReference, true);
  assert.deepEqual(ev.sources.map((s) => s.ref), ["a.txt:5", "quoted output"]);
  assert.match(ev.sources[0].text, /^3\tline 3\n4\tline 4\n5\tline 5\n6\tline 6\n7\tline 7$/);
  assert.deepEqual(ev.missing, ["a.txt:50 (file has 10 lines)", "nope.txt (file not found)"]);
  assert.match(ev.unverified[0], /^http:\/\/localhost\/x \(blocked host/);
});

test("checkEvidence sees no reference in a bare assertion", async () => {
  const ev = await checkEvidence(["the docs say so"], [tmpdir()]);
  assert.equal(ev.hasReference, false);
});

test("focus keeps the part of a long page that matches the evidence", () => {
  const page = "filler text. ".repeat(2000) + "Jev costs $0.042 per million input tokens." + " more filler.".repeat(2000);
  const out = focus(page, "Jev costs $0.042 per million input tokens", 3000);
  assert.ok(out.length <= 3100);
  assert.match(out, /\$0\.042 per million/);
});
