import { checkEvidence, type Source } from "./evidence.js";
import { lowerOf, type FindingDraft, type Gate } from "./jev.js";

/** Rules on a claim given the source passages. Jev in production; the eval also plugs in an LLM. */
export type Judge = (f: FindingDraft, sources: Source[]) => Promise<Gate>;

/**
 * `first` rules on every finding. When it passes one but flags it as unsure, `second` decides.
 * Only the first judge's own doubts escalate; unreadable sources are added later and still go to a human.
 */
export function escalate(first: Judge, second: Judge, name: string): Judge {
  return async (f, sources) => {
    const g = await first(f, sources);
    if (!g.ok || g.review.length === 0) return g;
    const s = await second(f, sources);
    return s.ok ? { ...g, review: [], checkedBy: name } : { ...s, scores: g.scores, checkedBy: name };
  };
}

/** Code checks the references exist, then the judge rules on the claim against what they say. */
export async function checkFinding(f: FindingDraft, roots: string[], judge: Judge): Promise<Gate> {
  const ev = await checkEvidence(f.evidence, roots);
  const reject = (reasons: string[]): Gate => ({ ok: false, reasons, confidence: "low", review: [] });
  if (!ev.hasReference) return reject(["no checkable reference: add a URL, a file:line, or quoted command output"]);
  if (ev.missing.length) return reject(ev.missing.map((m) => `reference not found: ${m}`));
  const unverified = ev.unverified.map((u) => `could not read ${u}`);
  if (ev.sources.length === 0) {
    return { ok: true, reasons: [], confidence: lowerOf(f.confidence, "medium"), review: [...unverified, "no source could be read, so the claim was not checked"] };
  }
  const g = await judge(f, ev.sources);
  return { ...g, review: [...unverified, ...g.review] };
}
