import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Tier } from "./config.js";

export const CONFIDENCE = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export interface FindingDraft {
  title: string;
  claim: string;
  evidence: string[];
  confidence: Confidence;
}

export interface Gate {
  ok: boolean;
  reasons: string[];
  /** Jev's own read of how well the evidence supports the claim. */
  confidence: Confidence;
}

/** Fast typed decisions. One Jev call per method; questions are atomic and combined in code. */
export interface Decider {
  routeTier(goal: string, item: string): Promise<Tier>;
  isDuplicate(candidate: string, claims: string[]): Promise<boolean>;
  gateFinding(f: FindingDraft): Promise<Gate>;
  goalAnswered(goal: string, summary: string, findings: string[]): Promise<number>;
}

export interface JevOptions {
  model?: string;
  /** Below this, routing falls back to `standard`. */
  minRouteConfidence?: number;
  /** Probability above which a work item counts as already claimed. */
  duplicateThreshold?: number;
}

export function createJev(client: TypeSafeClient, opts: JevOptions = {}): Decider {
  const model = opts.model ?? "jev-latest";
  const minRoute = opts.minRouteConfidence ?? 0.5;
  const dupThreshold = opts.duplicateThreshold ?? 0.7;

  return {
    async routeTier(goal, item) {
      const { answers } = await client.systemOne({
        model,
        state: { goal, workItem: item },
        questions: {
          tier: choice("Which model tier should investigate this work item", {
            fast: "Collecting stated facts, numbers, or limits from documentation or code, even across a few pages, with simple arithmetic at most",
            standard: "Explaining how something works, or comparing options where the answer needs judgement",
            powerful: "Combining many earlier findings into a recommendation, or a design decision with trade-offs",
          }),
        },
      });
      return answers.tier.confidence < minRoute ? "standard" : answers.tier.choice;
    },

    async isDuplicate(candidate, claims) {
      if (claims.length === 0) return false;
      const { answers } = await client.systemOne({
        model,
        state: { candidate, existingClaims: claims },
        questions: {
          dup: noul("The candidate work item is already covered by one of the existing claims"),
        },
      });
      return answers.dup.noul >= dupThreshold;
    },

    async gateFinding(f) {
      const { answers } = await client.systemOne({
        model,
        state: { claim: f.claim, evidence: f.evidence, statedConfidence: f.confidence },
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
      if (answers.concrete.noul < 0.5) reasons.push("no checkable reference in evidence");
      if (answers.supports.noul < 0.5) reasons.push("evidence does not support the claim as stated");
      return { ok: reasons.length === 0, reasons, confidence: answers.confidence.choice };
    },

    async goalAnswered(goal, summary, findings) {
      if (findings.length === 0) return 0;
      const { answers } = await client.systemOne({
        model,
        state: { goal, summary, findings },
        questions: {
          done: noul("The findings together answer the goal question well enough that further research would add little"),
        },
      });
      return answers.done.noul;
    },
  };
}

/** Used when a Jev feature is switched off: never routes, never blocks. */
export const passthrough: Decider = {
  routeTier: async () => "standard",
  isDuplicate: async () => false,
  gateFinding: async (f) => ({ ok: true, reasons: [], confidence: f.confidence }),
  goalAnswered: async () => 0,
};
