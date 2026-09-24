import { readFileSync } from "node:fs";
import type { Post } from "./board.js";

export interface Thread {
  id: string;
  text: string;
}

export interface Goal {
  question: string;
  threads: Thread[];
  instructions: string;
}

const THREAD = /^- ([A-Za-z0-9]+): (.+)$/;

export function parseGoal(text: string): Goal {
  const sections = new Map<string, string[]>();
  let cur = "goal";
  for (const line of text.split("\n")) {
    const m = /^##? (.+)$/.exec(line);
    if (m) {
      cur = m[1].trim().toLowerCase();
      sections.set(cur, []);
      continue;
    }
    (sections.get(cur) ?? sections.set(cur, []).get(cur)!).push(line);
  }
  const threads = (sections.get("threads") ?? [])
    .map((l) => THREAD.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ id: m[1], text: m[2].trim() }));
  return {
    question: (sections.get("goal") ?? []).join("\n").trim(),
    threads,
    instructions: (sections.get("instructions") ?? []).join("\n").trim(),
  };
}

export const loadGoal = (file: string) => parseGoal(readFileSync(file, "utf8"));

export interface WorkItem {
  kind: "thread" | "question";
  /** Thread id, or the question's post id. */
  ref: string;
  text: string;
}

/** Threads nobody has claimed, then questions addressed to `me` or ANY that have no reply. */
export function openItems(goal: Goal, posts: Post[], me: string): WorkItem[] {
  const claimed = new Set(posts.flatMap((p) => p.fields.Thread ?? []));
  const answered = new Set(posts.flatMap((p) => p.fields.Re ?? []));
  const threads = goal.threads
    .filter((t) => !claimed.has(t.id))
    .map<WorkItem>((t) => ({ kind: "thread", ref: t.id, text: t.text }));
  const questions = posts
    .filter((p) => p.type === "QUESTION" && p.author !== me)
    .filter((p) => (p.fields.To ?? ["@ANY"]).some((to) => to === `@${me}` || to === "@ANY"))
    .filter((p) => !answered.has(`${p.author}-${p.n}`))
    .map<WorkItem>((p) => ({ kind: "question", ref: `${p.author}-${p.n}`, text: `${p.title}: ${(p.fields.Q ?? []).join(" ")}` }));
  return [...threads, ...questions];
}
