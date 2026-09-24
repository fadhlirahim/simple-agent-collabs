import type { Case, Run } from "./judges.js";

export interface Row {
  case: Case;
  runs: Record<string, Run>;
}

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
  /** Cases a second judge ruled on because Jev was unsure. */
  escalated: string[];
  errors: string[];
  costUsd: number;
  avgMs: number;
  byKind: Record<string, { agree: number; total: number }>;
}

export function score(rows: Row[], judge: string): JudgeScore {
  const s: JudgeScore = {
    judge, agree: 0, total: 0, falsePass: [], falseFail: [], review: [], reviewCaught: [],
    decidedByCode: 0, escalated: [], errors: [], costUsd: 0, avgMs: 0, byKind: {},
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
    if (r.escalated) s.escalated.push(c.id);
    s.costUsd += r.costUsd;
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
    `| Flagged for review, all findings | ${scores.map((s) => s.review.length).join(" | ")} |`,
    `| Sent to the LLM for a second opinion | ${scores.map((s) => s.escalated.length).join(" | ")} |`,
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
  const jevJudges = scores.map((s) => s.judge).filter((j) => rows.some((r) => r.runs[j]?.support !== undefined));
  if (jevJudges.length) {
    const f = (n?: number) => (n === undefined ? "–" : n.toFixed(2));
    lines.push(
      "",
      "Jev's numbers per case. Support under 0.50 rejects; under 0.80 is flagged for review. Certainty under 0.80 is flagged too.",
      "",
      `| Case | Kind | Label | ${jevJudges.map((j) => `${j} support`).join(" | ")} | ${jevJudges.map((j) => `${j} certainty`).join(" | ")} |`,
      `| --- | --- | --- |${jevJudges.map(() => " --- |").join("").repeat(2)}`,
      ...rows.map(({ case: c, runs }) => `| ${c.id} | ${c.kind} | ${c.label} | ${jevJudges.map((j) => f(runs[j]?.support)).join(" | ")} | ${jevJudges.map((j) => f(runs[j]?.certainty)).join(" | ")} |`),
    );
  }
  return lines.join("\n");
}
