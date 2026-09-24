import { choice, noul, type TypeSafeClient } from "@typesafe-ai/sdk";
import type { LanguageModel } from "ai";
import { checkFinding, escalate, type Judge } from "../gate.js";
import { createJev, type Confidence, type FindingDraft } from "../jev.js";
import { llmJudge } from "../llm-judge.js";

export interface Case {
  id: string;
  kind: string;
  label: "pass" | "fail";
  claim: string;
  evidence: string[];
  confidence: Confidence;
  why: string;
}

export interface Run {
  pass: boolean;
  /** Passed, but flagged for a human to look at. */
  review: boolean;
  /** "code" when the reference check decided and no judge was asked. */
  stage: "code" | "judge";
  /** A second judge ruled because Jev was unsure. */
  escalated: boolean;
  reason: string;
  ms: number;
  costUsd: number;
  /** Jev only: probability the claim is supported, and certainty of its strength label. */
  support?: number;
  certainty?: number;
  error?: string;
}

export interface EvalJudge {
  name: string;
  run(c: Case): Promise<Run>;
}

/** $ per million tokens: [input, output]. */
export type Price = [number, number];
export const JEV_PRICE: Price = [0.042, 0];
const usd = ([pin, pout]: Price, inTok: number, outTok = 0) => (inTok * pin + outTok * pout) / 1e6;

const draft = (c: Case): FindingDraft => ({ title: c.id, claim: c.claim, evidence: c.evidence, confidence: c.confidence });

/** The gate before the research: Jev sees the citation strings only. Mirrors eval/sources/old-gate.ts. */
export function jevCitationsOnly(client: TypeSafeClient, model = "jev-latest"): EvalJudge {
  return {
    name: "jev-citations",
    async run(c) {
      const t = performance.now();
      const { answers, usage } = await client.systemOne({
        model,
        state: { claim: c.claim, evidence: c.evidence, statedConfidence: c.confidence },
        questions: {
          concrete: noul("At least one evidence item is a checkable reference: a file path with line, a URL, or quoted command output"),
          supports: noul("The evidence directly supports the claim as stated, not a weaker or different claim"),
          confidence: choice("How well does the evidence support the claim", {
            high: "Directly shown by a primary source",
            medium: "Supported but with a gap, inference, or secondary source",
            low: "Weakly supported, speculative, or contradicted",
          }),
        },
      });
      const reasons: string[] = [];
      if (answers.concrete.noul < 0.5) reasons.push(`no checkable reference (${answers.concrete.noul.toFixed(2)})`);
      if (answers.supports.noul < 0.5) reasons.push(`not supported (${answers.supports.noul.toFixed(2)})`);
      return {
        pass: reasons.length === 0,
        review: false,
        stage: "judge",
        escalated: false,
        reason: reasons.join("; ") || `supported (${answers.supports.noul.toFixed(2)})`,
        ms: performance.now() - t,
        costUsd: usd(JEV_PRICE, usage.input_tokens),
        support: answers.supports.noul,
      };
    },
  };
}

/** Runs the production pipeline (code checks, then `judge`) and records whether the judge was reached. */
async function throughGate(c: Case, roots: string[], judge: Judge, cost: () => number): Promise<Run> {
  const t = performance.now();
  let asked = false;
  const g = await checkFinding(draft(c), roots, (f, s) => ((asked = true), judge(f, s)));
  return {
    pass: g.ok,
    review: g.ok && g.review.length > 0,
    stage: asked ? "judge" : "code",
    escalated: !!g.checkedBy,
    reason: [...g.reasons, ...g.review].join("; ") || (g.checkedBy ? `confirmed by ${g.checkedBy}` : "supported"),
    ms: performance.now() - t,
    costUsd: cost(),
    support: g.scores?.support,
    certainty: g.scores?.certainty,
  };
}

/** Today's gate: code checks the references, then Jev judges the claim against the fetched sources. */
export function jevWithSources(client: TypeSafeClient, roots: string[], model = "jev-latest"): EvalJudge {
  return {
    name: "jev-sources",
    async run(c) {
      let tokens = 0;
      const jev = createJev(client, { model, onUsage: (u) => (tokens += u.input_tokens) });
      return throughGate(c, roots, jev.gateFinding, () => usd(JEV_PRICE, tokens));
    },
  };
}

/** An LLM in the judge's seat, given exactly what Jev gets. */
export function llmWithSources(model: LanguageModel, price: Price, roots: string[], name: string): EvalJudge {
  return {
    name,
    async run(c) {
      let cost = 0;
      const judge = llmJudge(model, (u) => (cost += usd(price, u.inputTokens, u.outputTokens)));
      return throughGate(c, roots, judge, () => cost);
    },
  };
}

/** The gate with a second opinion: Jev on everything, the LLM only where Jev is unsure. */
export function jevThenLlm(client: TypeSafeClient, model: LanguageModel, price: Price, roots: string[], name: string): EvalJudge {
  return {
    name,
    async run(c) {
      let cost = 0;
      const jev = createJev(client, { onUsage: (u) => (cost += usd(JEV_PRICE, u.input_tokens)) });
      const llm = llmJudge(model, (u) => (cost += usd(price, u.inputTokens, u.outputTokens)));
      return throughGate(c, roots, escalate(jev.gateFinding, llm, "llm"), () => cost);
    },
  };
}
