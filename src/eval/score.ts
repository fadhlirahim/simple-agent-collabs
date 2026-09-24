import type { Case, Run } from "./judges.js";

export interface Row {
  case: Case;
  runs: Record<string, Run>;
}

/** $ per million tokens: [input, output]. */
export type Prices = Record<string, [number, number]>;

export interface JudgeScore {
  judge: string;
  agree: number;
  total: number;
  /** Should have failed but passed. The costly mistake for a gate. */
  falsePass: string[];
  /** Should have passed but failed. */
  falseFail: string[];
  /** Passed with a review note. */
  review: string[];
  /** Failed cases that passed only with a review note, so a human would still see them. */
  reviewCaught: string[];
  decidedByCode: number;
  errors: string[];
  costUsd: number;
  avgMs: number;
  byKind: Record<string, { agree: number; total: number }>;
}

export function score(rows: Row[], judge: string, prices: [number, number]): JudgeScore {
  const s: JudgeScore = {
    judge, agree: 0, total: 0, falsePass: [], falseFail: [], review: [], reviewCaught: [],
    decidedByCode: 0, errors: [], costUsd: 0, avgMs: 0, byKind: {},
  };
  let ms = 0;
  for (const { case: c, runs } of rows) {
    const r = runs[judge];
    if (!r) continue;
    if (r.error) {
      s.errors.push(c.id);
      continue;
    }
    const k = (s.byKind[c.kind] ??= { agree: 0, total: 0 });
    s.total++;
    k.total++;
    const right = r.pass === (c.label === "pass");
    if (right) {
      s.agree++;
      k.agree++;
    } else (r.pass ? s.falsePass : s.falseFail).push(c.id);
    if (r.review) s.review.push(c.id);
    if (r.review && c.label === "fail") s.reviewCaught.push(c.id);
    if (r.stage === "code") s.decidedByCode++;
    s.costUsd += (r.inputTokens * prices[0] + r.outputTokens * prices[1]) / 1e6;
    ms += r.ms;
  }
  s.avgMs = s.total ? ms / s.total : 0;
  return s;
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");

export function report(rows: Row[], scores: JudgeScore[]): string {
  const kinds = [...new Set(rows.map((r) => r.case.kind))];
  const lines = [
    `| | ${scores.map((s) => s.judge).join(" | ")} |`,
    `| --- |${scores.map(() => " --- |").join("")}`,
    `| Agrees with label | ${scores.map((s) => `${s.agree}/${s.total} (${pct(s.agree, s.total)})`).join(" | ")} |`,
    `| Bad finding passed | ${scores.map((s) => s.falsePass.length).join(" | ")} |`,
    `| …of those, flagged for review | ${scores.map((s) => s.reviewCaught.length).join(" | ")} |`,
    `| Good finding failed | ${scores.map((s) => s.falseFail.length).join(" | ")} |`,
    `| Decided by code, no judge | ${scores.map((s) => s.decidedByCode).join(" | ")} |`,
    `| Errors | ${scores.map((s) => s.errors.length).join(" | ")} |`,
    `| Cost for the set | ${scores.map((s) => `$${s.costUsd.toFixed(5)}`).join(" | ")} |`,
    `| Average time per case | ${scores.map((s) => `${Math.round(s.avgMs)} ms`).join(" | ")} |`,
    "",
    `| Kind | ${scores.map((s) => s.judge).join(" | ")} |`,
    `| --- |${scores.map(() => " --- |").join("")}`,
    ...kinds.map((k) => `| ${k} | ${scores.map((s) => (s.byKind[k] ? `${s.byKind[k].agree}/${s.byKind[k].total}` : "–")).join(" | ")} |`),
    "",
    "Disagreements with your labels:",
    "",
  ];
  for (const s of scores) {
    for (const id of [...s.falsePass, ...s.falseFail]) {
      const row = rows.find((r) => r.case.id === id)!;
      const r = row.runs[s.judge];
      lines.push(`- ${s.judge} ${id} (${row.case.kind}, label ${row.case.label}): said ${r.pass ? "pass" : "fail"}${r.review ? " with review" : ""}. ${r.reason}`);
    }
  }
  return lines.join("\n");
}
