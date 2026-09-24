import { generateText } from "ai";
import { readFile, writeFile } from "node:fs/promises";
import { readBoard, withSummary } from "./board.js";
import type { Config } from "./config.js";
import type { Goal } from "./goal.js";
import { resolveModel } from "./models.js";
import { summaryPrompt } from "./prompts.js";

export async function summarize(config: Config, goal: Goal, boardFile: string, write: boolean): Promise<string> {
  const board = await readBoard(boardFile);
  const { text } = await generateText({
    model: resolveModel(config.summarizer ?? config.tiers.standard),
    prompt: summaryPrompt(goal, board),
  });
  if (write) await writeFile(boardFile, withSummary(await readFile(boardFile, "utf8"), text));
  return text;
}
