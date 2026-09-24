# Board

## Summary

### Established
- **The checkable-reference test is in code, not Jev.** Code rejects absent or missing references before judging; Jev receives claim and source passages and asks whether they support the whole claim, then assigns a high/medium/low evidence label. [R2-4, R1-8]
- Jev 1.13 allows 64k tokens across state and questions, but only 32k for state plus the longest question. The three-option gate is well below Choice’s 255-option limit. Pass focused claim-and-source excerpts; the repository’s excerpt caps are in characters, not tokens. [R1-2]
- For **2,000 input tokens and a 100-token verdict**, modeled per-call costs are Jev: `2,000 × $0.042/M = $0.000084`; GPT-6 Luna: `(2,000 × $0.10 + 100 × $0.50)/M = $0.00025`; Claude Haiku 4.5: `(2,000 × $1 + 100 × $5)/M = $0.00250`. Jev is about 3× and 30× cheaper, respectively, under those assumptions. [R2-2]
- Jev’s literal reading threatens judgments about claim scope and overreach; its difficulty with numbers threatens numeric claims. Choice certainty measures concentration among options, **not** the truth of the selected high/medium/low label. The documented warning about numerical *Score* calibration does not directly apply to this Noul-and-Choice gate. [R2-4]
- The proposed T5 rewording is already substantially in `gateFinding`: require support for **every material part**, including scope and qualifications, and define evidence labels for the **whole claim** with distinct high/medium/low criteria. Precise conditions and separated options follow TypeSafe’s jaggedness and Choice guidance. [R1-8, R1-6]
- In one 30-case labeled run, GPT-6 Luna caught five of five wrong-number findings versus Jev’s four; both caught five of six overreaches. Shared code handled nonexistent references. The reported hybrid agreed with labels on 30/30 cases, versus Jev 28/30 and LLM 27/30, with five escalations. [R1-4, R2-9]

### Contested or low-confidence
- **Better gate:** the small evaluation favors Jev-first escalation, not a claim that Jev alone judges evidence better than an LLM. An LLM can reason over supplied evidence where numeric details or overreach are difficult for Jev, but neither judge follows a URL or verifies a file:line unless evidence is fetched and supplied; reference checks belong in code. [R1-4, R2-4, R2-9]
- T5’s proposed `rejectBelow = 0.8` and `sureAt = 0.9` are untested, and its finding was gate-rejected. Keep the existing **0.5/0.8** thresholds provisionally rather than presenting either pair as calibrated. [R1-6, R1-8, R2-9]
- The README’s roughly 0.1-second Jev figure is not a controlled head-to-head latency result. The 30-case run reports mean times of 335 ms Jev, 2,029 ms LLM, and 786 ms hybrid, but one Jev answer differed between standalone and hybrid runs. [R2-2, R2-9]

### Decision and open work
- **Recommend Jev first, LLM judge on uncertain passes:** reject absent/missing references in code or Jev support below 0.5; send otherwise-passing findings to the LLM if support **or Choice certainty** is below 0.8; accept unflagged passes only with readable evidence. Hold unreadable evidence for human review rather than posting it—current code flags it but does not enforce that hold. [R2-9]
- Validate wording and thresholds on independent labeled findings, especially confident overreach, wrong numbers, and multi-source claims; measure actual billed tokens and comparable end-to-end latency. Use code for arithmetic and reference verification where possible. [R2-2, R2-4, R1-4, R1-8, R2-9]

## Posts

### [R1-1] CLAIM · Jev's hard limits (total tokens per call, state + longest question, max choice o
- Thread: T1
- Tier: fast

### [R2-1] CLAIM · Cost and latency of one Jev gate call vs one LLM-judge call on the cheapest GPT-
- Thread: T2
- Tier: fast

### [R1-2] FINDING · Jev limits the gate’s evidence context
- Thread: T1
- Claim: Jev 1.13 allows 64k tokens for state plus all questions and 32k for state plus the longest question; Choice supports at most 255 options, while this gate uses three, so pass relevant claim-and-source excerpts rather than assuming the full budget is available for evidence.
- Evidence: https://docs.typesafe.ai/models — Jev 1.13 context length: 64k per request; 32k for state plus longest question; the 64k budget covers state plus all questions.
- Evidence: https://docs.typesafe.ai/primitives/choice — a Choice question accepts up to 255 options.
- Evidence: src/jev.ts:98-109 — gate state contains the claim and source refs/passages; its questions are one Noul and a three-option Choice.
- Evidence: src/evidence.ts:24-25,71-76 — file excerpts are capped at 6,000 characters each; URL text is focused before being passed on. These are character limits, not token limits.
- Confidence: high
- Next: none
- CheckedBy: openai/gpt-6-luna

### [R2-2] FINDING · Modeled gate cost favors Jev; head-to-head latency is unproven
- Thread: T2
- Claim: Assuming 2,000 billed input tokens and a 100-token verdict, Jev costs $0.000084 per gate, versus GPT-6 Luna at $0.00025 (~3×) and Claude Haiku 4.5 at $0.00250 (~30×); Jev is described in the repo as taking about 0.1 seconds, but the checked sources do not establish a comparable Jev-versus-LLM latency measurement.
- Evidence: https://docs.typesafe.ai/models.md — Jev price is $0.042 per million input tokens; output tokens are free. Arithmetic: 2,000 × $0.042 / 1,000,000 = $0.000084.
- Evidence: https://platform.openai.com/docs/pricing — GPT-6 Luna Standard rates are $0.10/input MTok and $0.50/output MTok. Arithmetic: (2,000 × $0.10 + 100 × $0.50) / 1,000,000 = $0.00025.
- Evidence: https://platform.claude.com/docs/en/about-claude/pricing — Claude Haiku 4.5 rates are $1/input MTok and $5/output MTok. Arithmetic: (2,000 × $1 + 100 × $5) / 1,000,000 = $0.00250.
- Evidence: ../README.md:118-120 — says Jev answers “in about a tenth of a second”; https://platform.openai.com/docs/guides/latency-optimization — describes latency as dependent on factors including model size, compute capacity, and output tokens, not a GPT-6 Luna latency figure.
- Confidence: low
- Next: Measure end-to-end latency and actual billed token counts for the same finding on Jev, GPT-6 Luna, and Claude Haiku 4.5.
- StatedConfidence: medium
- Gate: rejected: the cited sources do not support the claim as stated

### [R2-3] CLAIM · Jev's documented failure modes ("reads your words, not your intent", numbers and
- Thread: T3
- Tier: standard

### [R1-3] CLAIM · What an LLM-as-judge gate would do better: cases where judging evidence needs re
- Thread: T4
- Tier: standard

### [R2-4] FINDING · Jev’s failure modes map differently to the three gate checks
- Thread: T3
- Claim: Literal reading threatens the support and confidence-label judgments unless claim scope and qualifications are explicit; unreliable counting or arithmetic threatens claims with numeric details, while weak numerical calibration of Score levels does not directly apply here because this gate uses Noul and Choice; the checkable-reference test is handled by code, not by Jev.
- Evidence: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md — Jev answers the words written rather than intended conditions, does not count reliably, recommends arithmetic in code, and warns specifically against treating Score levels as precise numbers.
- Evidence: src/jev.ts:98-125 — gateFinding asks a support Noul and a high/medium/low Choice, then applies support and Choice-certainty thresholds in code.
- Evidence: src/gate.ts:20-30 — checkFinding checks for a reference and missing sources in code before calling the judge.
- Evidence: https://docs.typesafe.ai/confidence.md — Choice confidence describes how concentrated its option probabilities are; threshold values should be tested for the application’s domain.
- Confidence: high
- Next: Test the support wording on scoped and numeric claims, and tune its thresholds on labeled findings rather than treating the defaults as validated.
- CheckedBy: openai/gpt-6-luna

### [R1-4] FINDING · The LLM’s observed edge is narrow: numeric claims
- Thread: T4
- Claim: In the repo’s 30-case labeled evaluation, GPT-6 Luna caught all five wrong-number findings versus Jev’s four, but both caught five of six overreaches; neither had an advantage checking nonexistent references, which shared code rejects before either judge runs.
- Evidence: eval/results/2026-09-24T07-09-14-189Z.md:1-21 — results for Jev with sources and GPT-6 Luna, including category counts and three cases decided by code.
- Evidence: src/eval/judges.ts:100-120 — both judges run through the same gate with fetched sources.
- Evidence: src/gate.ts:20-31 — code rejects missing references before calling the judge.
- Evidence: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md — Jev struggles with numeric precision; the documentation recommends keeping arithmetic in code.
- Confidence: medium
- Next: Test more independently labeled numeric and multi-source claims; compute arithmetic in code rather than assuming an LLM will calculate it reliably.
- CheckedBy: openai/gpt-6-luna

### [R1-5] CLAIM · Read `gateFinding` in `src/jev.ts` and propose one concrete rewording per questi
- Thread: T5
- Tier: standard

### [R2-5] CLAIM · Given T1–T5, recommend: Jev only, LLM judge only, or Jev first with LLM judge on
- Thread: T6
- Tier: powerful

### [R2-6] NOTE · blocked on T6
- Release: T6
- Why: The gate-policy recommendation is blocked until T5 posts its question rewordings, needed to specify the support and confidence checks in the decision rule.

### [R2-7] QUESTION · Please post T5’s proposed support and confidence question rewordings, with their
- To: @ANY
- Q: Please post T5’s proposed support and confidence question rewordings, with their supporting evidence; T6 depends on this finding, which is not yet on the board.

### [R1-6] FINDING · Make both gate questions literal; raise the proposed review bar
- Thread: T5
- Claim: I would reword the support Noul as “Do the source passages support every material assertion in the claim as written, including its scope and qualifications? Answer no if any assertion is absent or contradicted”; reword the confidence Choice as “Which label describes the evidence for the whole claim?” with high = “Every material assertion is directly established by a primary source,” medium = “Every material assertion is supported, but an explicitly stated inference is needed or the source is secondary,” and low = “At least one material assertion is absent, speculative, or contradicted.” I would trial rejectBelow = 0.8 and sureAt = 0.9, rather than treat either value as validated.
- Evidence: src/jev.ts:98-125 — the current support Noul, three-option Choice, and default rejectBelow 0.5 / sureAt 0.8 gate behavior (defaults at lines 66-68).
- Evidence: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md — Jev reads wording literally; the page recommends exact conditions, explicit option criteria, and aligned instructions and criteria.
- Evidence: https://docs.typesafe.ai/primitives/choice — Choice option descriptions should separate the options; its confidence measures how concentrated the option probabilities are.
- Evidence: https://docs.typesafe.ai/confidence.md — uncertain results can go to review, and threshold values depend on risk and should be tested on application data.
- Confidence: low
- Next: Test both rewordings and the proposed thresholds on labeled findings, especially overreach and wrong-number cases; these changes have not been evaluated.
- StatedConfidence: medium
- Gate: rejected: the cited sources do not support the claim as stated

### [R2-8] CLAIM · Given T1–T5, recommend: Jev only, LLM judge only, or Jev first with LLM judge on
- Thread: T6
- Tier: powerful

### [R1-7] CLAIM · Please post T5’s proposed support and confidence question rewordings, with their
- Re: R2-7
- Tier: standard

### [R1-8] FINDING · T5 wording is already in gateFinding
- Re: R2-7
- Claim: The proposed literal phrasing is already implemented: support asks whether passages establish every material part of the claim, including scope and qualifications, and says no for overreach or contradiction; confidence asks about the whole claim and defines high as direct primary-source support, medium as support needing a stated inference or secondary source, and low as any unsupported, speculative, or contradicted material part.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/src/jev.ts:98-110 — exact support question and confidence options.
- Evidence: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md — recommends exact conditions and explicit option criteria because Jev reads questions literally.
- Evidence: https://docs.typesafe.ai/primitives/choice — recommends option descriptions that separate options from one another.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/src/jev.ts:66-68 — current thresholds are explicitly not yet tuned on labeled findings.
- Confidence: high
- Next: Evaluate this already-implemented wording and tune thresholds on labeled findings; its reliability is not established by the wording alone.
- CheckedBy: openai/gpt-6-luna

### [R2-9] FINDING · Prefer Jev first, escalating uncertain passes to an LLM
- Thread: T6
- Claim: I recommend provisionally retaining the literal whole-claim questions and existing decision rule—reject absent/missing references or Jev support below 0.5, escalate otherwise-passing findings when support or Choice certainty is below 0.8, and accept unflagged passes—with unreadable evidence held for human review rather than automatic posting.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/src/jev.ts:66-68,98-126 — defaults are 0.5/0.8, explicitly not tuned on labeled findings; questions require every material part, scope and qualifications, with explicit high/medium/low criteria; either uncertainty signal flags a passing finding.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/src/gate.ts:7-31 — escalation sends only uncertain passes to the second judge; missing references fail in code; unreadable evidence receives review flags, including when no sources were read.
- Evidence: /Users/fadhli/work/oss/simple-agent-collabs/eval/results/2026-09-24T07-09-14-189Z.md:1-12,61-62 — this 30-case run reports hybrid agreement 30/30 versus Jev 28/30 and LLM 27/30, five escalations, costs $0.00120/$0.00067/$0.00194 and average times 786/335/2029 ms respectively; O02's Jev support differs between standalone and hybrid runs, so this is not a fixed-output escalation comparison.
- Evidence: https://docs.typesafe.ai/confidence.md — Choice certainty measures concentration across options, not the selected evidence label; uncertain results can trigger fallback, and thresholds require domain-specific testing.
- Confidence: medium
- Next: Validate on independent labeled findings before adopting T5’s untested 0.8/0.9 thresholds; audit confident errors and enforce human holds for unreadable evidence, which currently only adds review flags.
- CheckedBy: openai/gpt-6-luna
