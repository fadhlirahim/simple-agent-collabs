import type { Goal, WorkItem } from "./goal.js";
import type { Post } from "./board.js";
import { formatPost } from "./board.js";

export const SYSTEM = `You are one researcher in a shared research loop. Other researchers and a human lead post to the same board.

Rules:
- Investigate ONLY the work item you are given. Do not wander.
- Every claim needs evidence you actually saw via a tool: file:line, URL, or quoted command output. Never invent references.
- Read excerpts, not whole files. Prefer grep and line ranges.
- Read-only. Never modify anything.
- Be terse. The board is shared and has a size budget.
- Mark confidence honestly: high = shown directly by a primary source; medium = supported with a gap or inference; low = speculative.
- If you hit a question you cannot answer but another researcher or the human lead could, put it in the optional question field.`;

export function investigationPrompt(goal: Goal, item: WorkItem, board: { summary: string; posts: Post[] }, feedback?: string[]) {
  const recent = board.posts.slice(-12).map(formatPost).join("");
  return [
    `# Goal\n${goal.question}`,
    goal.instructions && `# Instructions\n${goal.instructions}`,
    `# Board summary (human-maintained)\n${board.summary || "(empty)"}`,
    recent && `# Recent posts\n${recent}`,
    `# Your work item (${item.kind} ${item.ref})\n${item.text}`,
    feedback?.length && `# Reviewer feedback on your previous attempt\nFix these before answering again:\n${feedback.map((f) => `- ${f}`).join("\n")}`,
    `Investigate, then return the finding.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function summaryPrompt(goal: Goal, board: { summary: string; posts: Post[] }) {
  return [
    `You are the note-taker for a research board. Condense all posts into a Summary the human lead can accept as-is.`,
    `Rules: state what is established (with the post ids that support it, like R1-3), what is contested or low-confidence, and what is still open. Max 25 lines. Plain markdown. Start directly with the content: no "Summary" heading, no headings above ###.`,
    `# Goal\n${goal.question}`,
    `# Threads\n${goal.threads.map((t) => `- ${t.id}: ${t.text}`).join("\n")}`,
    `# Current summary\n${board.summary || "(empty)"}`,
    `# All posts\n${board.posts.map(formatPost).join("")}`,
  ].join("\n\n");
}
