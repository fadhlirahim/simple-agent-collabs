import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { resolveModel } from "../models.js";
import { jevCitationsOnly, jevWithSources, llmWithSources, type Case, type EvalJudge } from "./judges.js";
import { report, score, type Prices, type Row } from "./score.js";

const PRICES: Prices = {
  "jev": [0.042, 0],
  "openai/gpt-6-luna": [0.1, 0.5],
  "openai/gpt-6-sol": [2, 10],
  "openai/gpt-6-astra": [10, 50],
  "anthropic/claude-haiku-4-5": [1, 5],
  "anthropic/claude-sonnet-5": [2, 10],
  "anthropic/claude-opus-5-5": [4, 20],
  "anthropic/claude-opus-5": [5, 25],
};

const { values } = parseArgs({
  options: {
    judge: { type: "string", default: "openai/gpt-6-luna" },
    env: { type: "string", default: ".env" },
    only: { type: "string" },
    concurrency: { type: "string", default: "5" },
  },
});

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try {
  process.loadEnvFile(resolve(values.env));
} catch {}

const wanted = (name: string) => !values.only || values.only.split(",").some((o) => name.startsWith(o));
const needed = [
  wanted("jev") && "TYPESAFE_API_KEY",
  wanted("llm") && ({ openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" } as Record<string, string>)[values.judge.split("/")[0]],
].filter((k): k is string => !!k && !process.env[k]);
if (needed.length) {
  console.error(`Missing ${needed.join(" and ")}. Set ${needed.length > 1 ? "them" : "it"}, or pass --env pointing at a .env file (e.g. --env my-research/.env).`);
  process.exit(1);
}

const cases: Case[] = JSON.parse(readFileSync(join(repo, "eval", "cases.json"), "utf8"));
const roots = [repo];
const jev = wanted("jev") ? new TypeSafeClient() : undefined;
const judges: EvalJudge[] = [
  ...(jev ? [jevCitationsOnly(jev), jevWithSources(jev, roots)] : []),
  llmWithSources(resolveModel(values.judge), roots, `llm:${values.judge.split("/")[1]}`),
].filter((j) => wanted(j.name));

console.log(`${cases.length} cases × ${judges.length} judges: ${judges.map((j) => j.name).join(", ")}`);
const rows: Row[] = cases.map((c) => ({ case: c, runs: {} }));
const limit = Number(values.concurrency);
for (let i = 0; i < rows.length; i += limit) {
  await Promise.all(
    rows.slice(i, i + limit).flatMap((row) =>
      judges.map(async (j) => {
        try {
          row.runs[j.name] = await j.run(row.case);
        } catch (e: any) {
          row.runs[j.name] = { pass: false, review: false, stage: "judge", reason: "", ms: 0, inputTokens: 0, outputTokens: 0, error: e.message };
          console.error(`${j.name} ${row.case.id}: ${e.message}`);
        }
      }),
    ),
  );
  process.stdout.write(`\r${Math.min(i + limit, rows.length)}/${rows.length}`);
}
console.log("\n");

const priceFor = (name: string): [number, number] => (name.startsWith("jev") ? PRICES.jev : PRICES[values.judge] ?? [0, 0]);
const scores = judges.map((j) => score(rows, j.name, priceFor(j.name)));
const md = report(rows, scores);
console.log(md);

const outDir = join(repo, "eval", "results");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify({ judge: values.judge, rows, scores }, null, 2));
writeFileSync(join(outDir, `${stamp}.md`), md + "\n");
console.log(`\nSaved eval/results/${stamp}.md and .json`);
