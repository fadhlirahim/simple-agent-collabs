import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Tier } from "./config.js";
import type { Source } from "./evidence.js";

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
  /** Why it was rejected. Sent back to the researcher for one retry. */
  reasons: string[];
  /** Jev's read of how well the sources support the claim. */
  confidence: Confidence;
  /** Passed, but a human should look. Posted as `Review:` lines. */
  review: string[];
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
export const lowerOf = (a: Confidence, b: Confidence) => (RANK[a] <= RANK[b] ? a : b);

/** Fast typed decisions. One Jev call per method; questions are atomic and combined in code. */
export interface Decider {
  routeTier(goal: string, item: string): Promise<Tier>;
  isDuplicate(candidate: string, claims: string[]): Promise<boolean>;
  /** Judges the claim against source passages already read by `checkEvidence`. */
  gateFinding(f: FindingDraft, sources: Source[]): Promise<Gate>;
  goalAnswered(goal: string, summary: string, findings: string[]): Promise<number>;
}

export interface JevOptions {
  model?: string;
  /** Below this, routing falls back to `standard`. */
  minRouteConfidence?: number;
  /** Probability above which a work item counts as already claimed. */
  duplicateThreshold?: number;
  /** Support below this rejects the finding. */
  rejectBelow?: number;
  /** Support or label certainty below this passes with a review note. */
  sureAt?: number;
}

export function createJev(client: TypeSafeClient, opts: JevOptions = {}): Decider {
  const model = opts.model ?? "jev-latest";
  const minRoute = opts.minRouteConfidence ?? 0.5;
  const dupThreshold = opts.duplicateThreshold ?? 0.7;
  // 0.5 / 0.8 come from TypeSafe's citation-check example; not yet tuned on labeled findings.
  const rejectBelow = opts.rejectBelow ?? 0.5;
  const sureAt = opts.sureAt ?? 0.8;

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

    async gateFinding(f, sources) {
      const { answers } = await client.systemOne({
        model,
        state: { claim: f.claim, sources: sources.map((s) => ({ ref: s.ref, passage: s.text })) },
        questions: {
          supports: noul(
            "The source passages establish every material part of the claim, including its scope and qualifications. No if the passages say less than the claim or contradict any part of it.",
          ),
          confidence: choice("Which description matches how well the source passages support the whole claim", {
            high: "The passages directly establish every material part of the claim, from a primary source",
            medium: "The passages support the claim but need a stated inference, or come from a secondary source",
            low: "A material part of the claim is unsupported, speculative, or contradicted",
          }),
        },
      });
      const support = answers.supports.noul;
      const label = answers.confidence;
      const review: string[] = [];
      if (support < rejectBelow) {
        return { ok: false, reasons: ["the cited sources do not support the claim as stated"], confidence: "low", review };
      }
      if (support < sureAt) review.push(`gate unsure the sources support the claim (${support.toFixed(2)})`);
      let confidence = label.choice;
      if (label.confidence < sureAt) {
        confidence = lowerOf(label.choice, f.confidence);
        review.push(`gate unsure of the confidence level (${label.confidence.toFixed(2)})`);
      }
      return { ok: true, reasons: [], confidence, review };
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
  gateFinding: async (f) => ({ ok: true, reasons: [], confidence: f.confidence, review: [] }),
  goalAnswered: async () => 0,
};
