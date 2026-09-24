# Jev models (test fixture)

Written for the eval from TypeSafe's docs as of 2026-09. Not a copy of the docs.

## Current model

- `jev-latest` currently resolves to `jev-1.13.0`.
- Jev 1.13 accepts up to 64,000 tokens per request, shared by the state and all questions.
- The state plus the single longest question must fit in 32,000 tokens.
- Input is text only: a string, a JSON object, or a JSON array. Images, audio, and video are not accepted.

## Pricing

- Input costs $0.042 per million tokens.
- Output tokens are free.

## Latency

- End-to-end latency is typically 70 to 500 milliseconds.
- Most requests complete in around 100 milliseconds.

## Output

- Every answer is one of the outcomes defined in the request, so Jev cannot return an invalid or malformed answer.
