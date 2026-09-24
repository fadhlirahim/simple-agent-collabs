import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkUrl, makeTools } from "../src/tools.js";

const opts = { toolCallId: "t", messages: [] } as any;

test("paths outside roots and symlink escapes are rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "sac-root-"));
  const outside = await mkdtemp(join(tmpdir(), "sac-out-"));
  await writeFile(join(outside, "secret.txt"), "x");
  await symlink(outside, join(root, "link"));
  const tools = makeTools([root]);
  await assert.rejects(tools.read_file.execute!({ path: join(outside, "secret.txt") }, opts), /outside allowed roots/);
  await assert.rejects(tools.read_file.execute!({ path: join(root, "link", "secret.txt") }, opts), /outside allowed roots/);
});

test("grep treats a leading-dash pattern as a pattern", async () => {
  const root = await mkdtemp(join(tmpdir(), "sac-grep-"));
  await writeFile(join(root, "a.txt"), "--version here\n");
  const out = await makeTools([root]).grep.execute!({ pattern: "--version", path: root }, opts);
  assert.match(String(out), /a\.txt:1:--version here/);
});

test("checkUrl blocks private hosts and odd schemes", () => {
  assert.equal(checkUrl("https://docs.typesafe.ai/x"), undefined);
  assert.match(checkUrl("http://localhost:8080/")!, /blocked host/);
  assert.match(checkUrl("http://169.254.169.254/latest/meta-data")!, /blocked host/);
  assert.match(checkUrl("http://10.0.0.5/")!, /blocked host/);
  assert.match(checkUrl("file:///etc/passwd")!, /blocked scheme/);
});
