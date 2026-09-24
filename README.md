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

## Example

[`jev-vs-llm-judge/`](jev-vs-llm-judge/) is a complete research run done with this tool: the goal,
the boards from all three runs, and a [report page](jev-vs-llm-judge/index.html) with the findings
and diagrams of how the researchers worked.

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

**Each turn**, a researcher:

1. Reads the board. Stops if it has hit its post limit.
2. Picks the first open thread, else an open question addressed to it or `@ANY`, skipping
   anything already covered. Picking and claiming happen one researcher at a time, so two
   researchers never take the same item.
3. Runs the model Jev picked for the item, with read-only tools (`read_file`, `grep`,
   `list_dir`, `fetch_url`) limited to the workspace and `paths`.
4. Gets a finding back and checks it (see the gate below). If the check fails, it tries once more
   with the reasons. If the item depends on work nobody has done yet, it gives the item back with
   a NOTE and posts a QUESTION asking for what's missing.
5. Appends the FINDING to the board.

After each round, the run stops if the goal looks answered. You can also stop with Ctrl-C at any
time. The board is always left in a readable state.

## Where Jev fits

The researchers never call Jev. They're LLMs, and they only use the read-only tools above. The
program around them asks Jev four quick questions at fixed points in each turn:

```
pick an item ───► Jev: is this already taken?                  (1)
      │
      ▼
choose a model ─► Jev: fast, standard, or powerful?            (2)
      │
      ▼
LLM researches, using tools only
      │
      ▼
check the finding ─► code: do the cited files and pages exist?
                  └► Jev: do those sources back the claim?     (3)
                        └► unsure? an LLM gives a second opinion
      │
      ▼
post to the board

after each round ─► Jev: is the goal answered yet?             (4)
```

1. **Is it taken?** Jev compares the item with what others have already claimed, and the
   researcher skips it if it's likely covered.
2. **Which model?** Jev reads the item and picks a tier. A lookup goes to the cheap model,
   combining findings into a recommendation goes to the strongest. If Jev is unsure, it uses the
   middle tier.
3. **Does the evidence hold up?** Code checks first. There must be a URL, a `file:line`, or
   quoted output, and every cited file, line, and page must exist. A made-up reference fails here
   without asking Jev. Then the cited lines and page text go to Jev, which says whether they back
   the whole claim and how strongly: high, medium, or low. This follows TypeSafe's
   [citation check](https://docs.typesafe.ai/cookbooks/citation_check.md) example.
   When Jev passes a finding but is unsure, an LLM set by `jev.escalateTo` reads the same
   passages and decides. If it disagrees, its reason goes back to the researcher for the retry,
   which Jev can't give because it never explains itself. Jev is also bad at arithmetic, so a
   claim like "20 times cheaper" usually lands here.
4. **Are we done?** Jev reads all the findings and says how likely it is that the goal is answered.

**Why Jev and not an LLM for these.** Each is a yes-or-no or pick-one question. Jev answers in
about a tenth of a second, costs $0.042 per million input tokens, and can only answer with one of
the options it was given. The LLM calls are saved for the research itself.

Jev answers with probabilities, and the program turns them into actions:

| Question | What happens |
| --- | --- |
| Is it taken? | 70% or more likely: skip the item |
| Which model? | Jev less than 50% sure: use the standard tier |
| Does the evidence hold up? | Support under 50%: reject and retry once. Under 80%, or Jev unsure how strong: ask the `escalateTo` LLM, or post with a `Review:` note if none is set |
| Are we done? | At or above `stopThreshold` (default 85%): end the run |

Jev's strength rating replaces the researcher's own when they differ. The researcher's is kept
as `StatedConfidence`. A finding that fails the check twice is still posted, with
`Gate: rejected`, so you see it rather than lose it.

Switch any of the four off in `research.yaml` under `jev:`. The program then skips nothing, uses
the standard tier, posts findings unchecked, and runs every round. With all four off, you don't
need `TYPESAFE_API_KEY`.

## Testing the gate

`eval/` holds 30 findings with known answers, to compare judges on the same material. Ten are
correct. The rest go beyond their source, get a number wrong, contradict their source, cite a
source that doesn't mention the claim, or cite a file or line that doesn't exist. Each one cites
small frozen source files in `eval/sources/`, so results don't change when a web page does.

```sh
bun run eval --env my-research/.env                               # all three judges
bun run eval --env my-research/.env --judge anthropic/claude-haiku-4-5
bun run eval --env my-research/.env --only jev                    # Jev judges only
```

Three judges run on every finding:

| Judge | What it sees |
| --- | --- |
| `jev-citations` | The gate before the fix: only the citation text, never the source |
| `jev-sources` | Today's gate: code checks the references exist, then Jev reads the cited lines |
| `llm:<model>` | The same checks and the same cited lines, judged by an LLM (GPT-6 Luna by default) |
| `jev+<model>` | Today's gate with a second opinion: Jev on every finding, the LLM only where Jev is unsure |

The report shows how often each judge agrees with the labels, how many bad findings it let
through, how many of those it flagged for review, and what the whole set cost. It's saved to
`eval/results/`. Every disagreement is listed with the judge's reason, so you can tell a wrong
judge from a wrong label. The labels are in `eval/cases.json`, each with a one-line reason.
Check them before you trust the numbers.

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
jev: { model: jev-latest, route: true, gate: true, dedupe: true, stop: true, stopThreshold: 0.85, escalateTo: openai/gpt-6-luna }
paths: [../some-repo]   # extra read-only roots, relative to the workspace
```

Model refs are `provider/model-id`. Tiers can mix providers. To add a provider, add one entry to
`providers` in `src/models.ts`.

## Layout

```
src/
  cli.ts         init · run · summarize · status
  researcher.ts  one turn: pick, claim, investigate, check, post
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
- The 0.5 and 0.8 gate cut-offs are TypeSafe's example values. The eval supports them on 30
  findings, which is too few to call them tuned.
- No LLM lead. You condense the Summary; `sac summarize` only drafts it.
- Single process. The lock is in-memory, so run one `sac run` per workspace.
- `fetch_url` blocks private and loopback targets by resolved IP and re-checks each redirect,
  but it does not pin the connection to the checked IP. A hostile DNS server that answers
  differently on the second lookup (DNS rebinding) could still reach a private address. Run
  in a sandbox if the agents will read untrusted pages on a network with internal services.

## License

[MIT](LICENSE)
