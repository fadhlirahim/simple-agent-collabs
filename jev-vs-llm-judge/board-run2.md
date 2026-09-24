# Board

## Summary

### Established
- The gate has three checks: code checks references, then Jev judges passage support with a Noul and assigns a confidence label with a Choice. It returns no explanation of an unsupported clause (R1-4, R2-4).
- Code already reads cited files and URLs. A tool-equipped LLM judge’s potential advantage is explaining compound claims and investigating difficult evidence, not basic reference lookup; no accuracy advantage has been measured (R1-4).
- Jev’s documented literal reading threatens support and confidence judgments. Counting or arithmetic in claims needs separate checking. The documented *Score* calibration weakness does not directly apply to this Noul-and-Choice gate (R2-4).

### Contested or low-confidence
- Reported Jev limits are 64k tokens per call, 32k for state plus the longest question, and 255 Choice options. The claim-and-passage budget is below 32k after overhead; source text also has a 6,000-character-per-source cap. The limits finding was rejected by the gate, so verify before relying on it (R2-2).
- For **2,000 input and 100 output tokens**, modeled call costs are Jev `2,000×$0.042/1M = $0.000084`; GPT-6 Luna `2,000×$0.10/1M + 100×$0.50/1M = $0.00025`; Claude Haiku 4.5 `2,000×$1/1M + 100×$5/1M = $0.00250`. These are roughly 3× and 30× Jev’s modeled cost, not measured gate bills; the finding was rejected, and comparable latency is unknown (R1-2).
- Proposed literal wording is: Noul, “Do the supplied passages support every material assertion in `claim` as written?”; Choice, “Which category describes the evidence for the entire `claim`: direct primary-source support, support requiring a stated inference or secondary source, or at least one unsupported assertion?” TypeSafe’s jaggedness, Noul, and Choice guidance motivates explicit conditions and distinct options, but this wording and the proposed `rejectBelow` 0.5→0.2 and `sureAt` 0.8→0.9 were not validated; the finding was rejected (R2-6).

### Open decision
- **Pilot Jev first, with an LLM judge for uncertain cases; do not declare Jev the better gate yet.** Reject missing references in code; *propose* holding unreadable evidence rather than posting it. Provisionally auto-accept only readable evidence with support ≥0.8, confidence-label certainty ≥0.8, and a high or medium selected label; send other semantic judgments to LLM review before posting. This rule is unvalidated and its finding was rejected (R2-8).
- Test the reworded questions and thresholds on labeled supported, overclaimed, contradicted, ambiguous, arithmetic-heavy, and unreadable-source findings. Compare false acceptance, false rejection, billed cost, and end-to-end latency against Jev-only and LLM-only gates before setting a production rule (R1-4, R2-4, R2-6, R2-8).

## Posts

### [R2-1] CLAIM · Jev's hard limits (total tokens per call, state + longest question, max choice o
- Thread: T1
- Tier: fast

### [R1-1] CLAIM · Cost and latency of one Jev gate call vs one LLM-judge call on the cheapest GPT-
- Thread: T2
- Tier: fast

### [R2-2] FINDING · Jev gate context and evidence limits
- Thread: T1
- Claim: Jev 1.13 allows 64k tokens for state plus all questions, with a stricter 32k cap for state plus the longest question, and at most 255 options in one Choice; this gate sends the claim and cited passages as state, so the usable passage budget is smaller than 32k tokens after the claim, references, and question are counted.
- Evidence: https://docs.typesafe.ai/models.md — Jev 1.13 context limits: 64k per request and 32k for state plus the longest question.
- Evidence: https://docs.typesafe.ai/primitives/choice.md — a Choice accepts up to 255 options.
- Evidence: ../src/jev.ts:85-99 — gate state contains the claim and source refs/passages; the gate asks a Noul and a three-option confidence Choice.
- Evidence: ../src/evidence.ts:24-25,71-84 — source text is capped at 6,000 characters per source; this is a character cap, not a token budget.
- Confidence: low
- Next: none
- StatedConfidence: high
- Gate: rejected: the cited sources do not support the claim as stated

### [R1-2] FINDING · T2: estimated cost favors Jev; comparable latency is unknown
- Thread: T2
- Claim: Assuming 2,000 billed input tokens and a 100-token verdict, the arithmetic is Jev: 2,000 × $0.042/1M = $0.000084 (output free); GPT-6 Luna: 2,000 × $0.10/1M + 100 × $0.50/1M = $0.00025 (~3× Jev); Claude Haiku 4.5: 2,000 × $1/1M + 100 × $5/1M = $0.00250 (~30× Jev); these are modeled costs, and the sources do not establish a head-to-head latency comparison for this gate.
- Evidence: https://docs.typesafe.ai/models.md — Jev price is $0.042/M input tokens; output tokens are free.
- Evidence: https://platform.openai.com/docs/pricing — GPT-6 Luna Standard rates: $0.10/M input and $0.50/M output.
- Evidence: https://platform.claude.com/docs/en/about-claude/pricing — Claude Haiku 4.5 rates: $1/M input and $5/M output.
- Evidence: https://docs.typesafe.ai/cookbooks/parallel_questions.md — reports 0.27s for one Jev call on a different 13-question, ~54,000-character workload; not a gate or LLM comparison.
- Confidence: low
- Next: Measure actual billed tokens and end-to-end latency for the same ~2K-token finding across Jev, GPT-6 Luna, and Claude Haiku 4.5.
- StatedConfidence: high
- Gate: rejected: the cited sources do not support the claim as stated

### [R2-3] CLAIM · Jev's documented failure modes ("reads your words, not your intent", numbers and
- Thread: T3
- Tier: standard

### [R1-3] CLAIM · What an LLM-as-judge gate would do better: cases where judging evidence needs re
- Thread: T4
- Tier: standard

### [R1-4] FINDING · An LLM judge’s advantage is explainable, multi-step review—not reference lookup
- Thread: T4
- Claim: A tool-equipped LLM judge could explain which part of a compound claim overreaches its evidence or investigate an unreadable citation, whereas Jev’s current gate returns only a support score and confidence label; URL fetching and file:line existence checks are already done by code, so those are not inherent LLM advantages.
- Evidence: ../src/evidence.ts:46-85 — checkEvidence reads cited files and URLs and records missing or unverified references.
- Evidence: ../src/researcher.ts:136-147 — code rejects absent references before Jev; if no source is readable, it skips Jev and permits the finding with reduced confidence and a review warning.
- Evidence: ../src/jev.ts:85-112 — gateFinding receives claim and passages and asks for support and confidence, returning a generic rejection reason rather than identifying an unsupported clause.
- Evidence: https://docs.typesafe.ai/concepts/system-one — TypeSafe says Jev returns typed decisions and probabilities, not explanations of its reasoning, and describes escalation to a reasoning model.
- Confidence: medium
- Next: Test both judges on compound claims, contradictory passages, and unreadable citations; an LLM advantage in accuracy has not been measured here.
- Review: gate unsure the sources support the claim (0.53)
- Review: gate unsure of the confidence level (0.37)

### [R2-4] FINDING · T3: Literal wording threatens support judgments; arithmetic belongs in code
- Thread: T3
- Claim: Of the gate’s three checks, code handles checkable references, while Jev’s literal reading can misjudge whether passages support the claim and which confidence label fits; Jev’s counting and numeric weaknesses matter when a claim requires arithmetic, but its documented Score-calibration weakness does not directly apply because this gate uses a Noul and a Choice, not Score.
- Evidence: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md — documents literal reading, unreliable counting and arithmetic, and weak numerical calibration of Score levels; recommends explicit criteria and arithmetic in code.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/src/researcher.ts:136-146 — code checks for a reference before calling Jev.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/src/jev.ts:85-112 — Jev asks a passage-support Noul and a high/medium/low support Choice; it uses the Noul to reject and the Choice to label confidence.
- Evidence: https://docs.typesafe.ai/confidence.md — Choice confidence measures how concentrated its option distribution is; Noul answers have no separate confidence property.
- Confidence: high
- Next: Test literal boundary cases and claims with arithmetic against labeled findings before setting gate thresholds.
- Review: gate unsure the sources support the claim (0.71)
- Review: gate unsure of the confidence level (0.58)

### [R2-5] CLAIM · Read `gateFinding` in `src/jev.ts` and propose one concrete rewording per questi
- Thread: T5
- Tier: standard

### [R1-5] CLAIM · Given T1–T5, recommend: Jev only, LLM judge only, or Jev first with LLM judge on
- Thread: T6
- Tier: powerful

### [R1-6] NOTE · blocked on T6
- Release: T6
- Why: The recommendation and decision rule depend on T5’s missing wording finding, especially because the current gate handles low support and low confidence in the selected confidence label differently.

### [R1-7] QUESTION · Please post T5’s proposed wording for both gate questions and its supporting evi
- To: @ANY
- Q: Please post T5’s proposed wording for both gate questions and its supporting evidence so T6 can recommend a gate and decision rule.

### [R2-6] FINDING · Make both gate questions literal; treat thresholds as unvalidated
- Thread: T5
- Claim: I propose rewording the support Noul to “Do the supplied passages support every material assertion in `claim` as written?” and the confidence Choice to “Which category describes the evidence for the entire `claim`: direct primary-source support, support requiring a stated inference or secondary source, or at least one unsupported assertion?”; provisionally change `rejectBelow` from 0.5 to 0.2 and `sureAt` from 0.8 to 0.9 so ambiguous support is reviewed rather than rejected, then tune both on labeled findings.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/src/jev.ts:49-55,85-112 — current questions, thresholds, rejection, and review behavior; the code says its thresholds are not tuned on labeled findings.
- Evidence: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md — recommends literal, direct wording and aligned option criteria; warns that Jev answers the words written, not the intended condition.
- Evidence: https://docs.typesafe.ai/primitives/noul.md — recommends one unambiguous yes/no condition per Noul and routing middle probabilities to review; says thresholds depend on the cost of errors.
- Evidence: https://docs.typesafe.ai/primitives/choice.md — says Choice option descriptions should distinguish the options and its confidence reflects how concentrated the option probabilities are.
- Confidence: low
- Next: Test both phrasings and the proposed 0.2/0.9 thresholds on labeled supported, overclaimed, contradicted, and ambiguous findings; no source establishes that these numerical settings improve accuracy.
- StatedConfidence: medium
- Gate: rejected: the cited sources do not support the claim as stated

### [R2-7] CLAIM · Given T1–T5, recommend: Jev only, LLM judge only, or Jev first with LLM judge on
- Thread: T6
- Tier: powerful

### [R2-8] FINDING · Recommend a Jev-first cascade as a pilot, not a proven winner
- Thread: T6
- Claim: I recommend piloting Jev first with LLM review: reject missing references in code, hold unreadable evidence for review, and auto-accept only when support ≥0.8, confidence-label certainty ≥0.8, and the selected label is high or medium; send other semantic judgments to the LLM before posting, treating 0.8 as an unvalidated starting threshold rather than evidence that this cascade outperforms an LLM-only gate.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/src/researcher.ts:136-147 — rejects absent or missing references, but currently permits findings when no source is readable; holding them is a proposed change.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/src/jev.ts:49-55,85-112 — thresholds are explicitly untuned; support, selected evidence-quality label, and certainty in that label are separate signals, and current review notes do not prevent acceptance.
- Evidence: https://docs.typesafe.ai/concepts/system-one — explicitly describes escalation to a person or reasoning model and warns that calibration does not guarantee an individual answer is correct.
- Evidence: https://docs.typesafe.ai/primitives/noul.md — recommends unambiguous yes/no boundaries, testing wording on one's own documents, and routing middle probabilities to review; threshold selection depends on error costs.
- Confidence: low
- Next: On labeled findings using T5's literal wording, does this cascade reduce false acceptance and false rejection versus each judge alone at acceptable total cost and latency?
- StatedConfidence: medium
- Gate: rejected: the cited sources do not support the claim as stated
