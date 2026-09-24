import { execFile } from "node:child_process";
import { readdir, readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";
import { tool } from "ai";
import { z } from "zod";

const run = promisify(execFile);
const MAX_CHARS = 20_000;

/** Read-only tools confined to `roots`. */
export function makeTools(roots: string[]) {
  const allowed = roots.map((r) => resolve(r));
  // Resolve symlinks so a link inside a root cannot point outside it.
  const guard = async (p: string) => {
    const abs = await realpath(resolve(p)).catch(() => resolve(p));
    const realRoots = await Promise.all(allowed.map((r) => realpath(r).catch(() => r)));
    if (!realRoots.some((r) => abs === r || abs.startsWith(r + sep))) {
      throw new Error(`Path outside allowed roots: ${p}. Allowed: ${allowed.join(", ")}`);
    }
    return abs;
  };
  const clip = (s: string) => (s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) + "\n…[truncated]" : s);

  return {
    read_file: tool({
      description: "Read a text file, optionally a line range. Prefer ranges over whole files.",
      inputSchema: z.object({
        path: z.string(),
        startLine: z.number().int().min(1).optional(),
        endLine: z.number().int().min(1).optional(),
      }),
      execute: async ({ path, startLine, endLine }) => {
        const lines = (await readFile(await guard(path), "utf8")).split("\n");
        const s = (startLine ?? 1) - 1;
        const e = endLine ?? Math.min(lines.length, s + 200);
        return clip(lines.slice(s, e).map((l, i) => `${s + i + 1}\t${l}`).join("\n"));
      },
    }),

    grep: tool({
      description: "Search files for a regex. Returns path:line:text.",
      inputSchema: z.object({ pattern: z.string(), path: z.string(), glob: z.string().optional() }),
      execute: async ({ pattern, path, glob }) => {
        // `-e` and `--` keep a pattern or path that starts with "-" from being read as a flag.
        const args = ["-rnIE", "--exclude-dir=node_modules", "--exclude-dir=.git"];
        if (glob) args.push(`--include=${glob}`);
        args.push("-e", pattern, "--", await guard(path));
        try {
          const { stdout } = await run("grep", args, { maxBuffer: 1 << 20 });
          return clip(stdout) || "(no matches)";
        } catch (e: any) {
          return e.code === 1 ? "(no matches)" : `grep error: ${e.message}`;
        }
      },
    }),

    list_dir: tool({
      description: "List a directory's entries.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const entries = await readdir(await guard(path), { withFileTypes: true });
        return entries.map((d) => (d.isDirectory() ? d.name + "/" : d.name)).join("\n");
      },
    }),

    fetch_url: tool({
      description: "Fetch a public URL and return its text content (HTML tags stripped).",
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        const blocked = checkUrl(url);
        if (blocked) return blocked;
        const res = await fetch(url, { headers: { "user-agent": "simple-agent-collabs/0.1" }, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) return `HTTP ${res.status} for ${url}`;
        const text = await res.text();
        const stripped = text
          .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&#160;/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\n\s*\n+/g, "\n");
        return clip(stripped.trim());
      },
    }),
  };
}

export type Tools = ReturnType<typeof makeTools>;

const PRIVATE_HOST = /^(localhost|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?fc|\[?fd|\[?fe80)/i;

/** Public http(s) only. Blocks loopback, link-local, and RFC1918 hosts. Returns a reason or undefined. */
export function checkUrl(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return `invalid URL: ${url}`;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return `blocked scheme: ${u.protocol}`;
  if (PRIVATE_HOST.test(u.hostname) || !u.hostname.includes(".")) return `blocked host: ${u.hostname}`;
  return undefined;
}
