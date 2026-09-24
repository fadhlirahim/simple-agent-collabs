import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { Judge } from "./gate.js";

const Verdict = z.object({
  supported: z.boolean(),
  reason: z.string().describe("One sentence."),
});

const SYSTEM = `You check research findings against their sources.
Decide whether the source passages establish every material part of the claim, including its scope and qualifications.
Answer supported=false if the passages say less than the claim, contradict any part of it, or do not address it.
Check any arithmetic yourself. Judge only from the passages given.`;

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

/** An LLM in the judge's seat. Same claim and passages as Jev, but it can explain and do arithmetic. */
export function llmJudge(model: LanguageModel, onUsage?: (u: LlmUsage) => void): Judge {
  return async (f, sources) => {
    const { output, usage } = await generateText({
      model,
      system: SYSTEM,
      prompt: `Claim: ${f.claim}\n\n${sources.map((s) => `Source ${s.ref}:\n${s.text}`).join("\n\n")}`,
      output: Output.object({ schema: Verdict }),
    });
    onUsage?.({ inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 });
    return output.supported
      ? { ok: true, reasons: [], confidence: f.confidence, review: [] }
      : { ok: false, reasons: [output.reason], confidence: "low", review: [] };
  };
}
