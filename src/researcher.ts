import { generateText, Output, stepCountIs, type LanguageModel } from "ai";
import { z } from "zod";
import { appendPost, nextN, readBoard, withBoardLock, writePost, type Board, type Post } from "./board.js";
import type { Config, Tier } from "./config.js";
import { activeClaims, openItems, type Goal, type WorkItem } from "./goal.js";
import { checkEvidence } from "./evidence.js";
import { CONFIDENCE, lowerOf, type Decider, type FindingDraft, type Gate } from "./jev.js";
import { investigationPrompt, SYSTEM } from "./prompts.js";
import type { Tools } from "./tools.js";

export interface Ctx {
  config: Config;
  goal: Goal;
  boardFile: string;
  tools: Tools;
  jev: Decider;
  /** Directories the tools and the evidence check may read. */
  roots: string[];
  model: (tier: Tier) => LanguageModel;
  log: (who: string, msg: string) => void;
}

const FindingSchema = z.object({
  status: z.enum(["answered", "blocked"]).describe('"blocked" if the item depends on findings not on the board yet'),
  title: z.string().max(80).describe("Short headline for the finding"),
  claim: z.string().describe("One sentence. What you found."),
  evidence: z.array(z.string()).min(1).max(4).describe("file:line, URL, or quoted command output. Max 4."),
  confidence: z.enum(CONFIDENCE),
  next: z.string().describe("Open question this raises, or 'none'"),
  // Nullable, not optional: OpenAI strict mode requires every property to be present.
  question: z
    .object({ to: z.string().describe("@R2, @Lead, or @ANY"), text: z.string() })
    .nullable()
    .describe("null unless you need another researcher or the human lead to answer something"),
});

export type TickResult = "posted" | "idle" | "capped" | "error";

/** One researcher does one unit of work: claim an item, investigate, post a gated finding. */
export async function tick(ctx: Ctx, me: string): Promise<TickResult> {
  const { config, goal, jev, log } = ctx;
  let board = await readBoard(ctx.boardFile);
  const mine = board.posts.filter((p) => p.author === me).length;
  if (mine >= config.maxPosts) return "capped";

  const post = (type: Post["type"], title: string, fields: Post["fields"]) =>
    appendPost(ctx.boardFile, { author: me, n: nextN(board.posts, me), type, title, fields }).then(async () => {
      board = await readBoard(ctx.boardFile);
    });

  // Pick and claim under the lock so two researchers never take the same item.
  const claimed = await withBoardLock(async () => {
    board = await readBoard(ctx.boardFile);
    const item = await pickItem(ctx, me, board);
    if (!item) return undefined;
    const tier: Tier = config.jev.route ? await jev.routeTier(goal.question, item.text) : "standard";
    const refKey = item.kind === "thread" ? "Thread" : "Re";
    await writePost(ctx.boardFile, { author: me, n: nextN(board.posts, me), type: "CLAIM", title: item.text.slice(0, 80), fields: { [refKey]: [item.ref], Tier: [tier] } });
    return { item, tier, refKey };
  });
  if (!claimed) return "idle";
  const { item, tier, refKey } = claimed;
  board = await readBoard(ctx.boardFile);
  log(me, `CLAIM ${item.ref} → ${tier} (${config.tiers[tier]})`);

  try {
    return await investigate(ctx, me, item, ctx.model(tier), post);
  } catch (e: any) {
    log(me, `error on ${item.ref}: ${e.message}`);
    await post("NOTE", `abandoned ${item.ref}`, { Release: [item.ref], Error: [String(e.message).slice(0, 200)] });
    return "error";
  }
}

async function investigate(
  ctx: Ctx,
  me: string,
  item: WorkItem,
  model: LanguageModel,
  post: (type: Post["type"], title: string, fields: Post["fields"]) => Promise<void>,
): Promise<TickResult> {
  const { config, goal, jev, log } = ctx;
  const refKey = item.kind === "thread" ? "Thread" : "Re";
  let board = await readBoard(ctx.boardFile);
  let feedback: string[] | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { output, totalUsage } = await generateText({
      model,
      system: SYSTEM,
      prompt: investigationPrompt(goal, item, board, feedback),
      tools: ctx.tools,
      stopWhen: stepCountIs(config.maxSteps + 1),
      output: Output.object({ schema: FindingSchema }),
    });
    if (output.status === "blocked") {
      // Give the item back instead of closing it with a non-answer.
      await post("NOTE", `blocked on ${item.ref}`, { Release: [item.ref], Why: [output.claim] });
      if (output.question) {
        await post("QUESTION", output.question.text.slice(0, 80), { To: [output.question.to], Q: [output.question.text] });
      }
      log(me, `blocked on ${item.ref}, released`);
      return "posted";
    }

    const gate: Gate = config.jev.gate ? await runGate(ctx, output) : { ok: true, reasons: [], confidence: output.confidence, review: [] };
    const tokens = `${totalUsage.inputTokens ?? 0}in/${totalUsage.outputTokens ?? 0}out`;

    if (!gate.ok && attempt === 1) {
      log(me, `gate rejected (${gate.reasons.join("; ")}), retrying`);
      feedback = gate.reasons;
      continue;
    }

    const fields: Post["fields"] = {
      [refKey]: [item.ref],
      Claim: [output.claim],
      Evidence: output.evidence,
      Confidence: [gate.confidence],
      Next: [output.next],
    };
    if (gate.confidence !== output.confidence) fields.StatedConfidence = [output.confidence];
    if (!gate.ok) fields.Gate = [`rejected: ${gate.reasons.join("; ")}`];
    if (gate.review.length) fields.Review = gate.review;
    await post("FINDING", output.title, fields);
    const flag = !gate.ok ? ", gate-rejected" : gate.review.length ? ", needs review" : "";
    log(me, `FINDING ${item.ref} [${gate.confidence}${flag}] ${tokens}`);

    if (output.question) {
      await post("QUESTION", output.question.text.slice(0, 80), { To: [output.question.to], Q: [output.question.text] });
    }
    return "posted";
  }
  return "posted";
}

/** Code checks the references exist, then Jev judges the claim against what they say. */
async function runGate(ctx: Ctx, f: FindingDraft): Promise<Gate> {
  const ev = await checkEvidence(f.evidence, ctx.roots);
  const reject = (reasons: string[]): Gate => ({ ok: false, reasons, confidence: "low", review: [] });
  if (!ev.hasReference) return reject(["no checkable reference: add a URL, a file:line, or quoted command output"]);
  if (ev.missing.length) return reject(ev.missing.map((m) => `reference not found: ${m}`));
  const unverified = ev.unverified.map((u) => `could not read ${u}`);
  if (ev.sources.length === 0) {
    return { ok: true, reasons: [], confidence: lowerOf(f.confidence, "medium"), review: [...unverified, "no source could be read, so the claim was not checked"] };
  }
  const g = await ctx.jev.gateFinding(f, ev.sources);
  return { ...g, review: [...unverified, ...g.review] };
}

async function pickItem(ctx: Ctx, me: string, board: Board): Promise<WorkItem | undefined> {
  const candidates = openItems(ctx.goal, board.posts, me);
  if (!ctx.config.jev.dedupe) return candidates[0];
  const claims = activeClaims(board.posts).map((p) => p.title);
  for (const c of candidates) {
    if (!(await ctx.jev.isDuplicate(c.text, claims))) return c;
    ctx.log(me, `skip ${c.ref}: already covered`);
  }
  return undefined;
}
