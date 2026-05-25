import { createHash } from "node:crypto";
import { patternRepository } from "@/lib/repositories/pattern.repository";
import { NormalizedTitle, Pattern } from "@/lib/types";

function simpleStem(word: string): string {
  return word
    .replace(/ies$/, "i")
    .replace(/ing$/, "")
    .replace(/ed$/, "")
    .replace(/s$/, "");
}

export const patternService = {
  normalizeTitle(title: string): NormalizedTitle {
    const cleaned = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim();

    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const terms = Array.from(new Set(tokens));
    const stems = terms.map(simpleStem).filter(Boolean).sort();

    const hash = createHash("sha256").update(stems.join(",") || cleaned).digest("hex").slice(0, 16);

    return { hash, terms, stemmedTerms: Array.from(new Set(stems)) };
  },

  async upsertPattern(userId: string, rawTitle: string): Promise<Pattern> {
    const { hash } = this.normalizeTitle(rawTitle);
    return patternRepository.upsertPattern(userId, hash, rawTitle);
  },
};
