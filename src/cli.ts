#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { readBoard } from "./board.js";
import { loadConfig, type Config } from "./config.js";
import { loadGoal, openItems } from "./goal.js";
import { createJev, passthrough, type Decider } from "./jev.js";
import { resolveModel } from "./models.js";
import { tick, type Ctx } from "./researcher.js";
import { summarize } from "./summarize.js";
import { makeTools } from "./tools.js";

const HELP = `sac — simple agent collabs

  sac init [dir]              scaffold goal.md, board.md, research.yaml
  sac run [--once] [--dir d]  run researcher rounds until done, capped, or stopped
  sac summarize [--write]     draft the board Summary (--write replaces it)
  sac status                  open threads and post counts

Env: ANTHROPIC_API_KEY / OPENAI_API_KEY (per tiers), TYPESAFE_API_KEY (Jev). Reads .env in --dir.`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    dir: { type: "string", short: "d", default: "." },
    once: { type: "boolean", default: false },
    write: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
const [cmd, arg] = positionals;
const dir = resolve(values.dir);
const boardFile = join(dir, "board.md");
const log = (who: string, msg: string) => console.log(`[${who}] ${msg}`);

function loadEnv() {
  try {
    process.loadEnvFile(join(dir, ".env"));
  } catch {}
}

function buildJev(config: Config): Decider {
  const j = config.jev;
  if (!j.route && !j.gate && !j.dedupe && !j.stop) return passthrough;
  if (!process.env.TYPESAFE_API_KEY) {
    throw new Error("TYPESAFE_API_KEY is not set. Set it, or turn off every `jev.*` flag in research.yaml.");
  }
  const real = createJev(new TypeSafeClient(), { model: j.model });
  return {
    routeTier: j.route ? real.routeTier : passthrough.routeTier,
    isDuplicate: j.dedupe ? real.isDuplicate : passthrough.isDuplicate,
    gateFinding: j.gate ? real.gateFinding : passthrough.gateFinding,
    goalAnswered: j.stop ? real.goalAnswered : passthrough.goalAnswered,
  };
}

async function init() {
  const target = resolve(arg ?? ".");
  mkdirSync(target, { recursive: true });
  const templates = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
  for (const f of ["goal.md", "board.md", "research.yaml"]) {
    const dest = join(target, f);
    if (existsSync(dest)) log("init", `keep ${f}`);
    else {
      copyFileSync(join(templates, f), dest);
      log("init", `wrote ${f}`);
    }
  }
  log("init", `next: edit ${join(target, "goal.md")}, set keys in .env, then \`sac run\``);
}

async function run(once: boolean) {
  loadEnv();
  const config = loadConfig(dir);
  const goal = loadGoal(join(dir, "goal.md"));
  const roots = [dir, ...config.paths.map((p) => resolve(dir, p))];
  const ctx: Ctx = {
    config,
    goal,
    boardFile,
    roots,
    tools: makeTools(roots),
    jev: buildJev(config),
    model: (tier) => resolveModel(config.tiers[tier]),
    log,
  };
  const names = Array.from({ length: config.researchers }, (_, i) => `R${i + 1}`);
  const rounds = once ? 1 : config.maxRounds;

  for (let round = 1; round <= rounds; round++) {
    log("run", `round ${round}/${rounds}`);
    const results = await Promise.all(names.map((n) => tick(ctx, n)));
    if (results.every((r) => r === "error")) {
      log("run", "every researcher failed this round; stopping. See NOTE posts on the board.");
      break;
    }
    if (results.every((r) => r !== "posted")) {
      log("run", results.every((r) => r === "capped") ? "all researchers at post cap" : "nothing left to pick up");
      break;
    }
    if (config.jev.stop) {
      const board = await readBoard(boardFile);
      const findings = board.posts.filter((p) => p.type === "FINDING").map((p) => `${p.title}: ${p.fields.Claim?.[0] ?? ""}`);
      const p = await ctx.jev.goalAnswered(goal.question, board.summary, findings);
      log("jev", `goal answered: ${p.toFixed(2)} (stop at ${config.jev.stopThreshold})`);
      if (p >= config.jev.stopThreshold) {
        log("run", "goal looks answered; stopping. Review board.md and run `sac summarize --write`.");
        break;
      }
    }
  }
}

async function status() {
  const config = loadConfig(dir);
  const goal = loadGoal(join(dir, "goal.md"));
  const board = await readBoard(boardFile);
  const open = openItems(goal, board.posts, "Lead");
  console.log(`threads: ${goal.threads.length} total, ${open.filter((i) => i.kind === "thread").length} open`);
  console.log(`open questions: ${open.filter((i) => i.kind === "question").length}`);
  for (let i = 1; i <= config.researchers; i++) {
    const n = board.posts.filter((p) => p.author === `R${i}`).length;
    console.log(`R${i}: ${n}/${config.maxPosts} posts`);
  }
}

try {
  if (values.help || !cmd) console.log(HELP);
  else if (cmd === "init") await init();
  else if (cmd === "run") await run(values.once);
  else if (cmd === "summarize") {
    loadEnv();
    console.log(await summarize(loadConfig(dir), loadGoal(join(dir, "goal.md")), boardFile, values.write));
  } else if (cmd === "status") await status();
  else {
    console.error(`unknown command: ${cmd}\n\n${HELP}`);
    process.exit(2);
  }
} catch (e: any) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
