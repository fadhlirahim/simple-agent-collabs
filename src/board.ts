import { appendFile, readFile } from "node:fs/promises";

export const POST_TYPES = ["CLAIM", "FINDING", "QUESTION", "DONE", "NOTE"] as const;
export type PostType = (typeof POST_TYPES)[number];

export interface Post {
  author: string;
  n: number;
  type: PostType;
  title: string;
  /** `- Key: value` lines. Repeated keys accumulate. */
  fields: Record<string, string[]>;
}

export interface Board {
  summary: string;
  posts: Post[];
}

const HEADER = /^### \[([A-Za-z0-9]+)-(\d+)\] (CLAIM|FINDING|QUESTION|DONE|NOTE) · (.+)$/;
const FIELD = /^- ([A-Za-z]+): (.*)$/;

export const postId = (p: Pick<Post, "author" | "n">) => `${p.author}-${p.n}`;

export function parseBoard(text: string): Board {
  const lines = text.split("\n");
  const posts: Post[] = [];
  const summary: string[] = [];
  let section: "summary" | "posts" | "other" = "other";
  let cur: Post | undefined;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      section = line.slice(3).trim().toLowerCase() === "summary" ? "summary" : "posts";
      cur = undefined;
      continue;
    }
    if (section === "summary") {
      summary.push(line);
      continue;
    }
    const h = HEADER.exec(line);
    if (h) {
      cur = { author: h[1], n: Number(h[2]), type: h[3] as PostType, title: h[4].trim(), fields: {} };
      posts.push(cur);
      continue;
    }
    const f = cur && FIELD.exec(line);
    if (f) (cur!.fields[f[1]] ??= []).push(f[2].trim());
  }
  return { summary: summary.join("\n").trim(), posts };
}

export function formatPost(p: Post): string {
  const fields = Object.entries(p.fields).flatMap(([k, vs]) => vs.map((v) => `- ${k}: ${v.replace(/\n+/g, " ")}`));
  return `\n### [${postId(p)}] ${p.type} · ${p.title}\n${fields.join("\n")}\n`;
}

export function nextN(posts: Post[], author: string): number {
  return posts.filter((p) => p.author === author).reduce((m, p) => Math.max(m, p.n), 0) + 1;
}

export async function readBoard(file: string): Promise<Board> {
  return parseBoard(await readFile(file, "utf8"));
}

// One in-process lock: appends never interleave, and read→pick→claim is atomic across researchers.
let queue: Promise<unknown> = Promise.resolve();
export function withBoardLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn);
  queue = next.catch(() => {});
  return next;
}

/** Raw append. Only call this while already holding the lock. */
export const writePost = (file: string, post: Post) => appendFile(file, formatPost(post));
export const appendPost = (file: string, post: Post) => withBoardLock(() => writePost(file, post));

/** Replace the body of `## Summary`, leaving everything else byte-identical. */
export function withSummary(text: string, summary: string): string {
  const re = /(^## Summary\n)([\s\S]*?)(?=^## |\s*$(?![\s\S]))/m;
  if (!re.test(text)) return `## Summary\n\n${summary}\n\n${text}`;
  return text.replace(re, `$1\n${summary.trim()}\n\n`);
}
