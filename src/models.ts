import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

type Factory = (id: string) => LanguageModel;

// Add a provider here and in research.yaml docs; nothing else changes.
const providers: Record<string, () => Factory> = {
  anthropic: () => {
    const p = createAnthropic();
    return (id) => p(id);
  },
  openai: () => {
    const p = createOpenAI();
    return (id) => p(id);
  },
};

const cache = new Map<string, Factory>();

/** `provider/model-id` → AI SDK model. */
export function resolveModel(ref: string): LanguageModel {
  const slash = ref.indexOf("/");
  const provider = ref.slice(0, slash);
  const id = ref.slice(slash + 1);
  const make = providers[provider];
  if (!make) throw new Error(`Unknown provider "${provider}" in "${ref}". Supported: ${Object.keys(providers).join(", ")}`);
  let f = cache.get(provider);
  if (!f) cache.set(provider, (f = make()));
  return f(id);
}
