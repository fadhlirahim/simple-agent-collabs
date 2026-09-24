import { choice, noul, type TypeSafeClient } from "@typesafe-ai/sdk";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { checkFinding, type Judge } from "../gate.js";
import { createJev, type Confidence, type FindingDraft } from "../jev.js";

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
  reason: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  /** Jev only: probability the claim is supported, and certainty of its strength label. */
  support?: number;
  certainty?: number;
  error?: string;
}

export interface EvalJudge {
  name: string;
  run(c: Case): Promise<Run>;
}

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
        reason: reasons.join("; ") || `supported (${answers.supports.noul.toFixed(2)})`,
        ms: performance.now() - t,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        support: answers.supports.noul,
      };
    },
  };
}

/** Runs the production pipeline (code checks, then `judge`) and records whether the judge was reached. */
async function throughGate(c: Case, roots: string[], judge: Judge, usage: () => [number, number]): Promise<Run> {
  const t = performance.now();
  let asked = false;
  const g = await checkFinding(draft(c), roots, (f, s) => ((asked = true), judge(f, s)));
  const [inputTokens, outputTokens] = usage();
  return {
    pass: g.ok,
    review: g.ok && g.review.length > 0,
    stage: asked ? "judge" : "code",
    reason: [...g.reasons, ...g.review].join("; ") || "supported",
    ms: performance.now() - t,
    inputTokens,
    outputTokens,
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
      return throughGate(c, roots, jev.gateFinding, () => [tokens, 0]);
    },
  };
}

const Verdict = z.object({
  supported: z.boolean(),
  reason: z.string().describe("One sentence."),
});

const JUDGE_SYSTEM = `You check research findings against their sources.
Decide whether the source passages establish every material part of the claim, including its scope and qualifications.
Answer supported=false if the passages say less than the claim, contradict any part of it, or do not address it.
Check any arithmetic yourself. Judge only from the passages given.`;

/** An LLM in the judge's seat, given exactly what Jev gets. */
export function llmWithSources(model: LanguageModel, roots: string[], name = "llm-sources"): EvalJudge {
  return {
    name,
    async run(c) {
      let tokens: [number, number] = [0, 0];
      const judge: Judge = async (f, sources) => {
        const { output, usage } = await generateText({
          model,
          system: JUDGE_SYSTEM,
          prompt: `Claim: ${f.claim}\n\n${sources.map((s) => `Source ${s.ref}:\n${s.text}`).join("\n\n")}`,
          output: Output.object({ schema: Verdict }),
        });
        tokens = [usage.inputTokens ?? 0, usage.outputTokens ?? 0];
        return output.supported
          ? { ok: true, reasons: [], confidence: f.confidence, review: [] }
          : { ok: false, reasons: [output.reason], confidence: "low", review: [] };
      };
      return throughGate(c, roots, judge, () => tokens);
    },
  };
}
