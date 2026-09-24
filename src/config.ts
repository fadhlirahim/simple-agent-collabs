import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

export const TIERS = ["fast", "standard", "powerful"] as const;
export type Tier = (typeof TIERS)[number];

const modelRef = z.string().regex(/^[a-z0-9-]+\/.+$/, "expected provider/model-id");

export const ConfigSchema = z.object({
  researchers: z.number().int().min(1).default(2),
  maxPosts: z.number().int().min(1).default(8),
  maxRounds: z.number().int().min(1).default(6),
  maxSteps: z.number().int().min(1).default(12),
  tiers: z.object({ fast: modelRef, standard: modelRef, powerful: modelRef }),
  summarizer: modelRef.optional(),
  jev: z
    .object({
      model: z.string().default("jev-latest"),
      route: z.boolean().default(true),
      gate: z.boolean().default(true),
      dedupe: z.boolean().default(true),
      stop: z.boolean().default(true),
      stopThreshold: z.number().min(0).max(1).default(0.85),
      /** LLM that rules on findings Jev passes but is unsure about. Unset: they get a Review note. */
      escalateTo: modelRef.optional(),
    })
    .prefault({}),
  paths: z.array(z.string()).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(dir: string): Config {
  const raw = parse(readFileSync(join(dir, "research.yaml"), "utf8"));
  return ConfigSchema.parse(raw ?? {});
}
