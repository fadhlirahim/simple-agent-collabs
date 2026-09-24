# OpenAI GPT-6 models (test fixture)

Written for the eval from OpenAI's model docs as of 2026-09. Not a copy of the docs.

| Model | Input $/1M | Output $/1M | Context | Positioning |
| --- | --- | --- | --- | --- |
| gpt-6-astra | $10.00 | $50.00 | 1.05M | Most capable, for multi-step work across code and browsers |
| gpt-6-sol | $2.00 | $10.00 | 1.05M | Complex coding and agentic workflows |
| gpt-6-luna | $0.10 | $0.50 | 1.05M | Most efficient, for focused high-volume tasks |

- All three models support function calling and structured outputs.
- gpt-6-sol and gpt-6-luna accept reasoning effort `none`. gpt-6-astra does not; use `low` instead.
