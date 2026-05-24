import { createHash } from "node:crypto";
import { predictionRepository } from "@/lib/repositories/prediction.repository";
import { NormalizedTitle, Pattern } from "@/lib/types";

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "it", "to", "for", "of", "in", "on",
  "and", "or", "at", "by", "with", "from", "do", "did", "does",
  "buy", "get", "make", "go", "have", "be", "not", "up", "out",
]);

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
    const terms = tokens.filter((t) => !STOP_WORDS.has(t) && t.length > 0);
    const stemmedTerms = [...new Set(terms.map(simpleStem).filter(Boolean))].sort();

    const hash = createHash("sha256").update(stemmedTerms.join(",") || title).digest("hex").slice(0, 16);

    return { hash, terms: [...new Set(terms)], stemmedTerms };
  },

  async upsertPattern(userId: string, rawTitle: string): Promise<Pattern> {
    const { hash } = this.normalizeTitle(rawTitle);
    return predictionRepository.upsertPattern(userId, hash, rawTitle);
  },
};
