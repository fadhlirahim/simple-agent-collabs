import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkUrl, isPrivateIp, makeTools } from "../src/tools.js";

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

test("isPrivateIp covers v4, v6, and v4-mapped ranges", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.equal(isPrivateIp(ip), false, ip);
});

test("checkUrl blocks private targets, odd schemes, and localhost", async () => {
  assert.match((await checkUrl("http://localhost:8080/"))!, /blocked host/);
  assert.match((await checkUrl("http://169.254.169.254/latest/meta-data"))!, /private address/);
  assert.match((await checkUrl("http://[::1]/"))!, /private address/);
  assert.match((await checkUrl("http://0x7f000001/"))!, /private address|cannot resolve/);
  assert.match((await checkUrl("file:///etc/passwd"))!, /blocked scheme/);
});
