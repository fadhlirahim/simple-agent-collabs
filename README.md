# simple-agent-collabs

A file-based research loop for one human and N LLM subagents. Inspired by
[huggingface/agent-collabs](https://github.com/huggingface/agent-collabs), stripped to two
markdown files and a CLI. Any LLM via the [AI SDK](https://ai-sdk.dev); fast typed decisions
via [Jev](https://docs.typesafe.ai) (TypeSafe AI's System One model).

```
goal.md  ──►  sac run  ──►  board.md  ◄──  you (human lead)
                 │
        R1 R2 … Rn subagents, each: pick → claim → investigate → gated FINDING
                 │
               Jev decides: which tier · duplicate? · evidence holds? · done?
```

## Quick start

Bun runs the TypeScript directly, so there is no build step.

```sh
bun install
bun sac init my-research              # goal.md, board.md, research.yaml
cp .env.example my-research/.env      # OPENAI_API_KEY + TYPESAFE_API_KEY (ANTHROPIC_API_KEY if you use Claude tiers)
$EDITOR my-research/goal.md           # the question + threads T1..Tn
bun sac run --once -d my-research     # one round first, to check keys and models
bun sac run -d my-research            # rounds until done, capped, or Jev says the goal is answered
bun sac summarize --write -d my-research   # draft the Summary; edit it; run again
```

`bun sac status -d my-research` shows open threads and post counts.

To get a global `sac` command instead of `bun sac ... -d dir`:

```sh
bun run build && bun link      # once, in this repo
cd my-research && sac run      # anywhere
```

Node works too: `npm install && npm run build`, then `node dist/cli.js`. Tests run with `bun run test`.

## How it works

**goal.md** is read-only for agents. It holds the question, a list of threads (`- T1: ...`), and
instructions.

**board.md** is append-only for agents. You own the `## Summary` section; agents never touch it.
Every post is a `###` header plus `- Key: value` lines, so `grep` and `sed` work on it:

```md
### [R2-3] FINDING · Jev caps input at 64K tokens
- Thread: T1
- Claim: State plus all questions share ~64K tokens; state plus longest question ≤ 32K
- Evidence: https://docs.typesafe.ai/primitives
- Confidence: high
- Next: none
```

Post types: `CLAIM` (taking a thread or question), `FINDING`, `QUESTION` (`- To: @R1|@Lead|@ANY`),
`NOTE` (replies via `- Re: R2-3`, or `- Release: T1` when an investigation failed), `DONE`.

**Each tick**, a researcher:

1. Reads the board. Stops if at its post cap.
2. Picks the first open thread, else an open question addressed to it or `@ANY`.
   Pick and claim happen under a lock, so parallel researchers never take the same item.
3. Asks Jev which model tier fits, then runs that model with read-only tools
   (`read_file`, `grep`, `list_dir`, `fetch_url`) confined to the workspace and `paths`.
4. Gets a structured finding back, asks Jev to gate it, retries once with the reasons if rejected.
5. Appends the FINDING. Jev's confidence read replaces the model's if they differ
   (the model's is kept as `StatedConfidence`). A finding that still fails the gate is posted
   with `- Gate: rejected: ...` so you see it rather than lose it.

**Between rounds**, Jev answers "do the findings answer the goal?" and `run` stops above
`stopThreshold`. You can also stop with Ctrl-C at any time; the board is always consistent.

## Where Jev sits

Jev is not an LLM. It takes state and typed questions and returns probabilities in ~100ms for
$0.042 per million input tokens. Here it makes four decisions, each one call, each batched into
atomic questions and combined in code:

| Decision | Question type | Fallback |
| --- | --- | --- |
| Tier routing | `choice` fast / standard / powerful | confidence < 0.5 → standard |
| Duplicate claim | `noul` | ≥ 0.7 → skip item |
| Finding gate | 2× `noul` + `choice` confidence | either noul < 0.5 → retry once |
| Stop | `noul` | ≥ `stopThreshold` → end run |

Turn any off in `research.yaml` under `jev:`. With all four off, `TYPESAFE_API_KEY` is not needed.

## Configuration

`research.yaml` (see `templates/research.yaml` for comments):

```yaml
researchers: 2
maxPosts: 8
maxRounds: 6
maxSteps: 12
tiers:
  fast: openai/gpt-6-luna
  standard: openai/gpt-6-sol
  powerful: anthropic/claude-opus-5-5   # tiers can mix providers
jev: { model: jev-latest, route: true, gate: true, dedupe: true, stop: true, stopThreshold: 0.85 }
paths: [../some-repo]   # extra read-only roots for the tools
```

Model refs are `provider/model-id`. Tiers can mix providers. To add a provider, add one entry to
`providers` in `src/models.ts`.

## Layout

```
src/
  cli.ts         init · run · summarize · status
  researcher.ts  one tick: pick, claim, investigate, gate, post
  jev.ts         Decider interface + Jev implementation + passthrough
  board.ts       parse/format posts, locked appends, Summary replace
  goal.ts        parse goal.md, compute open work items
  models.ts      provider/model-id → AI SDK model
  tools.ts       read-only tools with path allowlist
  prompts.ts     system prompt and prompt builders
  summarize.ts   Summary draft
templates/       copied by `sac init`
test/            node:test, offline (mock model + scripted Decider)
```

## Not in v1

- No web search tool. `fetch_url` works on known URLs. Provider-native search
  (Anthropic/OpenAI web search tools) is a one-line add once you want it.
- No LLM lead. You condense the Summary; `sac summarize` only drafts it.
- Single process. The lock is in-memory, so run one `sac run` per workspace.
- `fetch_url` blocks private and loopback targets by resolved IP and re-checks each redirect,
  but it does not pin the connection to the checked IP. A hostile DNS server that answers
  differently on the second lookup (DNS rebinding) could still reach a private address. Run
  in a sandbox if the agents will read untrusted pages on a network with internal services.
