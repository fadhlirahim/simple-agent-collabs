# Goal

Is Jev a better gate for research findings in this loop than an LLM-as-judge, and
what question phrasing makes Jev's gate reliable?

A "gate" here is the check in `src/jev.ts` (`gateFinding`) that runs before a FINDING
lands on the board: does the evidence contain a checkable reference, does it support
the claim as stated, and how confident should we be.

## Threads

- T1: Jev's hard limits (total tokens per call, state + longest question, max choice options) and what they mean for how much of a finding we can pass as state.
- T2: Cost and latency of one Jev gate call vs one LLM-judge call on the cheapest GPT-6 and Claude tiers, for a finding of ~2K tokens. Show the arithmetic.
- T3: Jev's documented failure modes ("reads your words, not your intent", numbers and counting, scores not calibrated) and which of the three gate questions in `src/jev.ts` each one threatens.
- T4: What an LLM-as-judge gate would do better: cases where judging evidence needs reasoning Jev cannot do (following a URL, checking a file:line exists, spotting a claim that overreaches its evidence).
- T5: Read `gateFinding` in `src/jev.ts` and propose one concrete rewording per question, each justified by a TypeSafe docs page. Include the thresholds you would change.
- T6: Given T1–T5, recommend: Jev only, LLM judge only, or Jev first with LLM judge on low confidence. State the decision rule.

## Instructions

- Primary sources first: https://docs.typesafe.ai pages, the OpenAI and Anthropic pricing pages, and this repo's code under `../src`.
- Every finding cites a URL or a file:line you actually read.
- T2 must show the numbers used, not just a conclusion.
- T5 and T6 depend on the others; if they are picked before T1–T4 have findings, post a QUESTION to @ANY instead of guessing.
