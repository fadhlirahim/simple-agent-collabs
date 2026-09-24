import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchText, makeGuard } from "./tools.js";

export interface Source {
  ref: string;
  text: string;
}

export interface Checked {
  /** At least one item is a URL, a file:line, or quoted output. */
  hasReference: boolean;
  /** Passages read from the cited files and pages. */
  sources: Source[];
  /** Cited but provably absent: missing file, line past the end, HTTP 404/410. */
  missing: string[];
  /** Cited but not readable right now: blocked host, network error, other HTTP errors. */
  unverified: string[];
}

const URL_RE = /https?:\/\/[^\s)<>\]"'`]+/g;
const FILE_RE = /([\w./-]+\.[A-Za-z0-9]+):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/g;
const QUOTED_RE = /`[^`]+`|"[^"]{4,}"/;
const MAX_SOURCE = 6000;
const CONTEXT_LINES = 2;

export interface FileRef {
  path: string;
  ranges: [number, number][];
}

/** Pull URLs and file:line refs out of one evidence item. */
export function parseRefs(item: string): { urls: string[]; files: FileRef[] } {
  const urls = (item.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:]+$/, ""));
  const rest = item.replace(URL_RE, " ");
  const files = [...rest.matchAll(FILE_RE)].map((m) => ({
    path: m[1],
    ranges: m[2].split(",").map((r) => {
      const [a, b] = r.split("-").map(Number);
      return [a, b ?? a] as [number, number];
    }),
  }));
  return { urls, files };
}

/** Read every cited source so the gate judges real text, not the citation's wording. */
export async function checkEvidence(items: string[], roots: string[]): Promise<Checked> {
  const out: Checked = { hasReference: false, sources: [], missing: [], unverified: [] };
  const guard = makeGuard(roots);

  for (const item of items) {
    const { urls, files } = parseRefs(item);
    if (urls.length || files.length) out.hasReference = true;
    else if (QUOTED_RE.test(item)) {
      out.hasReference = true;
      out.sources.push({ ref: "quoted output", text: item });
    }

    for (const f of files) {
      const lines = await readCited(f.path, [process.cwd(), ...roots], guard);
      const ref = `${f.path}:${f.ranges.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(",")}`;
      if (!lines) {
        out.missing.push(`${f.path} (file not found)`);
        continue;
      }
      const past = f.ranges.find(([, b]) => b > lines.length);
      if (past) {
        out.missing.push(`${ref} (file has ${lines.length} lines)`);
        continue;
      }
      const text = f.ranges
        .map(([a, b]) => {
          const s = Math.max(1, a - CONTEXT_LINES);
          const e = Math.min(lines.length, b + CONTEXT_LINES);
          return lines.slice(s - 1, e).map((l, i) => `${s + i}\t${l}`).join("\n");
        })
        .join("\n…\n");
      out.sources.push({ ref, text: text.slice(0, MAX_SOURCE) });
    }

    for (const url of urls) {
      const page = await fetchText(url);
      if (page.ok) out.sources.push({ ref: url, text: focus(page.text, item.replace(url, "")) });
      else if (page.status === 404 || page.status === 410) out.missing.push(`${url} (${page.reason})`);
      else out.unverified.push(`${url} (${page.reason})`);
    }
  }
  return out;
}

async function readCited(p: string, bases: string[], guard: (p: string) => Promise<string>) {
  for (const base of bases) {
    try {
      return (await readFile(await guard(resolve(base, p)), "utf8")).split("\n");
    } catch {}
  }
  return undefined;
}

/** For a long page, keep the chunks that share the most words with the evidence text. */
export function focus(text: string, hint: string, max = MAX_SOURCE): string {
  if (text.length <= max) return text;
  const words = new Set(hint.toLowerCase().match(/[a-z0-9$.%]{4,}/g) ?? []);
  const size = 1500;
  const chunks: { at: number; score: number }[] = [];
  for (let at = 0; at < text.length; at += size / 2) {
    const chunk = text.slice(at, at + size).toLowerCase();
    let score = 0;
    for (const w of words) if (chunk.includes(w)) score++;
    chunks.push({ at, score });
  }
  return chunks
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.floor(max / size))
    .sort((a, b) => a.at - b.at)
    .map((c) => text.slice(c.at, c.at + size))
    .join("\n…\n");
}
