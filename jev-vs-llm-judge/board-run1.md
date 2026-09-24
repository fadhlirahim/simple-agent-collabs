# Board

## Summary

### Summary

- **Recommendation:** Use **Jev first, with a tool-equipped LLM judge for uncertain or unverified findings**. Jev is cheaper for the stated example, but the current gate cannot establish that a cited URL or file line exists: it receives strings, not retrieved sources. This is a proposed policy, not a measured comparison of gate accuracy. (R1-4, R1-6, R2-8)
- **Limits:** Jev 1.13 permits 64k tokens per request, with a separate 32k limit on state plus the longest question. Its Choice limit is 255 options; this gate uses three. Pass only relevant claim, evidence, and—if retrieved—source excerpts within those limits. Jev accepts text and does not retrieve sources or produce an explanatory verdict. (R2-8)
- **Cost for an assumed 2,000 input tokens and 100-token LLM verdict:** Jev: `2,000 × $0.042/1M = $0.000084` (output free); GPT-6 Luna: `2,000 × $0.10/1M + 100 × $0.50/1M = $0.00025`; Claude Haiku 4.5: `2,000 × ## Summary
/1M + 100 × $5/1M = $0.00250`. These omit any additional retrieval or judging work; the 100-token verdict is assumed. No comparable gate-latency measurement is established. (R1-4)
- **Failure modes:** Jev’s literal reading threatens all three questions unless conditions are explicit. Unreliable counting threatens “at least one” reference and numerical support checks; detect reference formats and do arithmetic in code where possible. Its warning about numerical *Score* calibration does not directly apply to this gate’s categorical confidence Choice; certainty about a Choice answer is a separate measure from the selected high/medium/low label. (R2-4)
- **Proposed `concrete` wording:** “Does an evidence entry give a location a reader could check—a URL, a file path with a line number, or quoted command output? An unsupported assertion or bare file path is no.” A locatable reference is **not** a verified one. (R2-6)
- **Proposed `supports` wording:** “Does the supplied source passage establish every material part of the claim, including its scope and qualifications? Answer no if the passage is absent, says less, or contradicts any part.” Retrieve passages first; otherwise neither the present Jev gate nor wording alone can check an external citation. (R2-6, R1-6)
- **Proposed `confidence` wording:** “Which description matches the supplied source passage’s support for the whole claim?” High: direct primary-source support for every material part; medium: support requiring a stated inference or secondary source; low: missing passage, material gap, speculation, or contradiction. (R2-6)
- **Provisional decision rule:** After deterministic reference checks and retrieval, accept through Jev only when both Noul answers are ≥0.8, the Choice answer’s *separate certainty* is ≥0.8, and its selected label is acceptable under board policy. Escalate Noul answers from 0.5 to <0.8, uncertain Choice answers, absent/unverified passages, or suspected overreach to a tool-equipped LLM; reject or require correction when a reference is missing or source evidence contradicts the claim. The 0.8 cutoffs and label policy are **untested**, not established operating thresholds. (R2-6, R1-6)
- **Open:** Benchmark both gates on identical retrieved excerpts, nonexistent references, overreaching and numerical claims; measure actual token counts, end-to-end latency, accuracy, and escalation rate before adopting thresholds or claiming Jev is the better gate overall. (R1-4, R1-6, R2-4, R2-6, R2-8)

## Posts

### [R2-1] CLAIM · Jev's hard limits (total tokens per call, state + longest question, max choice o
- Thread: T1
- Tier: standard

### [R1-1] CLAIM · Cost and latency of one Jev gate call vs one LLM-judge call on the cheapest GPT-
- Thread: T2
- Tier: standard

### [R2-2] NOTE · abandoned T1
- Release: T1
- Error: Invalid schema for response_format 'response': In context=(), 'required' is required to be supplied and to be an array including every key in properties. Missing 'question'.

### [R1-2] NOTE · abandoned T2
- Release: T2
- Error: Invalid schema for response_format 'response': In context=(), 'required' is required to be supplied and to be an array including every key in properties. Missing 'question'.

### [R1-3] CLAIM · Cost and latency of one Jev gate call vs one LLM-judge call on the cheapest GPT-
- Thread: T2
- Tier: standard

### [R2-3] CLAIM · Jev's documented failure modes ("reads your words, not your intent", numbers and
- Thread: T3
- Tier: standard

### [R2-4] FINDING · Jev’s documented weak spots map to all three finding-gate questions
- Thread: T3
- Claim: Literal reading threatens the `concrete` and `supports` wording and the `confidence` criteria; unreliable counting threatens `concrete`’s “at least one” test and support checks involving numerical claims; weak numerical calibration of Score levels does not directly threaten this gate because its confidence question is a categorical Choice.
- Evidence: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md — Jev answers the words written rather than intended conditions, does not count reliably, recommends arithmetic in code, and warns specifically against interpolating numerical magnitudes from Score levels.
- Evidence: src/jev.ts:70-82 — the gate sends claim and evidence to three questions: `concrete` (at least one reference), `supports` (claim as stated), and a high/medium/low `confidence` Choice.
- Evidence: src/jev.ts:84-87 — only the two Noul answers determine acceptance at 0.5; the Choice supplies the returned confidence label.
- Evidence: https://docs.typesafe.ai/confidence.md — Choice answer `confidence` is a separate statistic derived from its option probabilities, not the high/medium/low label selected by this gate.
- Confidence: high
- Next: Test literal, borderline, and numerical findings against the three questions; move reference-format detection and counting into code where possible.

### [R1-4] FINDING · T2: Jev gate cost is lower; latency comparison is unmeasured
- Thread: T2
- Claim: For an assumed 2,000-input-token finding and 100-output-token LLM verdict, one Jev gate costs about $0.000084, versus $0.00025 for GPT-6 Luna and $0.00250 for Claude Haiku 4.5; there is no measured head-to-head gate latency in the sources checked.
- Evidence: src/jev.ts:70-87 — gateFinding sends the finding and three questions in one Jev call.
- Evidence: https://docs.typesafe.ai/models.md — Jev costs $0.042 per million input tokens; output tokens are free: 2,000 × $0.042 / 1,000,000 = $0.000084.
- Evidence: https://platform.openai.com/docs/pricing — GPT-6 Luna Standard costs $0.10/input MTok and $0.50/output MTok: 2,000 × $0.10 / 1M + 100 × $0.50 / 1M = $0.00025 (≈3× Jev). https://www.anthropic.com/pricing#api — Haiku 4.5 costs $1/input MTok and $5/output MTok: $0.002 + $0.0005 = $0.00250 (≈30× Jev).
- Evidence: https://docs.typesafe.ai/cookbooks/parallel_questions.md — a different workload (a ~54,000-character article and 13 batched questions) averaged 0.27 seconds per Jev call; this is not a 2K-token gate benchmark or an LLM comparison.
- Confidence: medium
- Next: Measure end-to-end latency and actual input/output token counts on identical gate findings across all three models; the LLM’s 100-token verdict is an assumption.

### [R1-5] CLAIM · What an LLM-as-judge gate would do better: cases where judging evidence needs re
- Thread: T4
- Tier: standard

### [R2-5] CLAIM · Read `gateFinding` in `src/jev.ts` and propose one concrete rewording per questi
- Thread: T5
- Tier: standard

### [R1-6] FINDING · T4: Tool-equipped LLM judges can verify sources the current Jev gate cannot
- Thread: T4
- Claim: An LLM judge with file and URL tools could check whether a cited line or page exists and read its context before judging overreach; the current Jev gate sees only the claim and evidence strings, though Jev can assess support when source text is supplied.
- Evidence: src/jev.ts:70-87 — gateFinding sends claim, evidence strings, and stated confidence to three typed questions; it does not retrieve cited sources.
- Evidence: src/tools.ts:27-40,69-84 — the researcher’s tools can read numbered file lines and fetch public URLs.
- Evidence: https://docs.typesafe.ai/introduction/coding-agents.md — Jev does not call tools; LLM-based coding agents do.
- Evidence: https://docs.typesafe.ai/cookbooks/citation_check.md — TypeSafe’s citation check first locates a quote in a supplied source, then uses Jev to classify whether its context supports, contradicts, or says nothing about the claim.
- Confidence: medium
- Next: Compare both judges on the same retrieved source excerpts and on deliberately nonexistent or contextually misleading references; an LLM’s advantage here is conditional on giving it retrieval tools.
- StatedConfidence: high

### [R2-6] FINDING · T5: Make each gate question literal, and review uncertain answers
- Thread: T5
- Claim: Reword the three questions to distinguish a locatable reference from verified source content, require support for every material part of the claim, and define confidence labels by explicit boundaries; raise the two acceptance thresholds from 0.5 to a provisional 0.8 and send uncertain verdicts to review.
- Evidence: src/jev.ts:70-87 — `gateFinding` currently sends claim, evidence, and stated confidence to two Nouls and a Choice; either Noul passes at 0.5, and the Choice label is returned without a certainty check.
- Evidence: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md — TypeSafe recommends exact conditions and boundary cases, arithmetic/counting in code, and less irrelevant state.
- Evidence: https://docs.typesafe.ai/cookbooks/citation_check.md — TypeSafe checks quote presence in code, then asks a Choice about the source passage’s relationship to the claim; its example sends verdicts below 0.8 Choice confidence to review.
- Evidence: https://docs.typesafe.ai/primitives/noul.md — A Noul near 0.5 is ambiguous; threshold choice depends on the cost of errors, and middle values can go to a reviewer. https://docs.typesafe.ai/confidence.md — Choice confidence measures certainty *about the selected option*, not the option’s label.
- Confidence: medium
- Next: Proposed wording: `concrete`: “Does an evidence entry give a location a reader could check—a URL, a file path with a line number, or quoted command output? An unsupported assertion or bare file path is no.” Prefer parsing these formats in code. `supports`: “Does the supplied source passage establish every material part of the claim, including its scope and qualifications? Answer no if the passage is absent, says less, or contradicts any part.” Fetch excerpts first: the current state may contain only URLs. `confidence`: “Which description matches the supplied source passage’s support for the whole claim?” high = directly establishes every material part in a primary source; medium = supports it but requires a stated inference or secondary source; low = missing passage, material gap, speculation, or contradiction. As an untested starting policy, require both Nouls ≥0.8 and review 0.5–0.8; automatically use the Choice label only when its *separate* `confidence` ≥0.8, otherwise review. Validate all cutoffs on labeled findings.

### [R1-7] CLAIM · Given T1–T5, recommend: Jev only, LLM judge only, or Jev first with LLM judge on
- Thread: T6
- Tier: powerful

### [R1-8] FINDING · QUESTION · T6 blocked on missing T1 finding
- Thread: T6
- Claim: The board records T1 as abandoned without a finding, so the required prerequisite for recommending a gate and decision rule is not yet met.
- Evidence: my-research/board.md:9-11 — T1 concerns Jev’s hard limits.
- Evidence: my-research/board.md:17-19 — T1 was abandoned following a response-schema error.
- Evidence: grep 'T1|T6|FINDING|abandoned' my-research/board.md — findings exist for T2–T5, but none for T1.
- Confidence: high
- Next: Wait for T1, then synthesize the gate recommendation and escalation rule from T1–T5.

### [R1-9] QUESTION · Can someone complete T1’s primary-source finding on Jev’s hard limits? T6 explic
- To: @ANY
- Q: Can someone complete T1’s primary-source finding on Jev’s hard limits? T6 explicitly requires findings from T1–T4 before recommending a gate; T1 currently has only an abandoned attempt.

### [R2-7] CLAIM · Can someone complete T1’s primary-source finding on Jev’s hard limits? T6 explic
- Re: R1-9
- Tier: standard

### [R2-8] FINDING · T1: Jev’s hard limits for the finding gate
- Re: R1-9
- Claim: Jev 1.13 allows 64k tokens per request but only 32k for the state plus its longest question, accepts text rather than images or audio, and cannot retrieve cited sources or generate an explanatory verdict; the current three-question gate fits its Choice limit but can judge only the claim and evidence strings it receives.
- Evidence: https://docs.typesafe.ai/models.md — specifies the 64k combined and 32k state-plus-longest-question limits, text-only input, and `jev-latest` → `jev-1.13.0`.
- Evidence: https://docs.typesafe.ai/api.md — a Choice permits at most 255 options; the gate’s three-option confidence Choice is within that limit.
- Evidence: https://docs.typesafe.ai/introduction/coding-agents.md — Jev returns structured decisions and does not generate text or call tools.
- Evidence: src/jev.ts:70-87 — `gateFinding` sends claim, evidence strings, and stated confidence, then uses two Nouls and a three-option Choice; it contains no source retrieval.
- Confidence: medium
- Next: If source verification is required, fetch cited passages before calling Jev; test whether those passages fit the context limits and whether the gate detects missing or misleading citations.
- StatedConfidence: high
