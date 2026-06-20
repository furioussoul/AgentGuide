import { countOccurrences } from "./tool-helpers.js";

type MatchStrategy =
  | "exact"
  | "quote-normalized"
  | "line-trimmed"
  | "whitespace-normalized"
  | "anchor";

interface Candidate {
  text: string;
  strategy: MatchStrategy;
}

export class SmartEditError extends Error {
  public constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "AMBIGUOUS",
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SmartEditError";
  }
}

export interface SmartEditResult {
  content: string;
  matchedText: string;
  replacementCount: number;
  strategy: MatchStrategy;
}

const quotePairs = new Map<string, string>([
  ["“", "\""],
  ["”", "\""],
  ["‘", "'"],
  ["’", "'"],
]);

function normalizeQuotes(value: string): string {
  return [...value].map((char) => quotePairs.get(char) ?? char).join("");
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function preview(value: string): string {
  return value.replace(/\r?\n/g, "\\n").slice(0, 180);
}

function uniqueCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const unique: Candidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.strategy}\0${candidate.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function quoteNormalizedCandidates(content: string, oldText: string): Candidate[] {
  const normalizedContent = normalizeQuotes(content);
  const normalizedOld = normalizeQuotes(oldText);
  if (normalizedContent === content && normalizedOld === oldText) return [];
  const candidates: Candidate[] = [];
  let cursor = 0;
  while (true) {
    const index = normalizedContent.indexOf(normalizedOld, cursor);
    if (index === -1) break;
    candidates.push({
      text: content.slice(index, index + oldText.length),
      strategy: "quote-normalized",
    });
    cursor = index + 1;
  }
  return candidates;
}

function lineTrimmedCandidates(content: string, oldText: string): Candidate[] {
  const contentLines = content.split("\n");
  const oldLines = oldText.split("\n");
  if (oldLines.at(-1) === "") oldLines.pop();
  const candidates: Candidate[] = [];
  if (oldLines.length === 0) return candidates;

  for (let start = 0; start <= contentLines.length - oldLines.length; start += 1) {
    const block = contentLines.slice(start, start + oldLines.length);
    const matches = block.every((line, index) => line.trim() === oldLines[index].trim());
    if (!matches) continue;
    candidates.push({ text: block.join("\n"), strategy: "line-trimmed" });
  }
  return candidates;
}

function whitespaceCandidates(content: string, oldText: string): Candidate[] {
  const normalizedOld = compactWhitespace(oldText);
  if (!normalizedOld) return [];
  const oldLineCount = Math.max(1, oldText.split("\n").length);
  const contentLines = content.split("\n");
  const candidates: Candidate[] = [];

  for (let start = 0; start <= contentLines.length - oldLineCount; start += 1) {
    const block = contentLines.slice(start, start + oldLineCount).join("\n");
    if (compactWhitespace(block) === normalizedOld) {
      candidates.push({ text: block, strategy: "whitespace-normalized" });
    }
  }
  return candidates;
}

function anchorCandidates(content: string, oldText: string): Candidate[] {
  const oldLines = oldText.split("\n").filter((line) => line.trim().length > 0);
  if (oldLines.length < 3) return [];
  const first = oldLines[0].trim();
  const last = oldLines.at(-1)?.trim();
  if (!last) return [];
  const contentLines = content.split("\n");
  const candidates: Candidate[] = [];

  for (let start = 0; start < contentLines.length; start += 1) {
    if (contentLines[start].trim() !== first) continue;
    for (let end = start + 2; end < contentLines.length; end += 1) {
      if (contentLines[end].trim() !== last) continue;
      const blockLines = contentLines.slice(start, end + 1);
      const comparable = Math.min(blockLines.length, oldLines.length);
      let matching = 0;
      for (let index = 1; index < comparable - 1; index += 1) {
        if (blockLines[index].trim() === oldLines[index].trim()) matching += 1;
      }
      const score = comparable <= 2 ? 1 : matching / (comparable - 2);
      if (score >= 0.5 || candidates.length === 0) {
        candidates.push({ text: blockLines.join("\n"), strategy: "anchor" });
      }
      break;
    }
  }
  return candidates.slice(0, 3);
}

function findClosestLine(content: string, oldText: string): string | undefined {
  const target = oldText.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim();
  if (!target) return undefined;
  const targetWords = new Set(target.split(/\W+/).filter(Boolean));
  let bestLine = "";
  let bestScore = -1;
  for (const line of content.split(/\r?\n/).slice(0, 600)) {
    const words = line.trim().split(/\W+/).filter(Boolean);
    if (words.length === 0) continue;
    const score = words.filter((word) => targetWords.has(word)).length / Math.max(words.length, targetWords.size, 1);
    if (score > bestScore) {
      bestScore = score;
      bestLine = line.trim();
    }
  }
  return bestLine ? preview(bestLine) : undefined;
}

function replacementWithQuoteStyle(matchedText: string, newText: string): string {
  if (!/[“”‘’]/.test(matchedText)) return newText;
  let result = newText;
  if (/[“”]/.test(matchedText)) {
    let open = true;
    result = result.replaceAll("\"", () => {
      const char = open ? "“" : "”";
      open = !open;
      return char;
    });
  }
  if (/[‘’]/.test(matchedText)) {
    let open = true;
    result = result.replaceAll("'", () => {
      const char = open ? "‘" : "’";
      open = !open;
      return char;
    });
  }
  return result;
}

export function smartEdit(content: string, oldText: string, newText: string, replaceAll = false): SmartEditResult {
  if (!oldText) {
    throw new SmartEditError("oldString must not be empty.", "NOT_FOUND");
  }
  if (oldText === newText) {
    throw new SmartEditError("oldString and newString are identical.", "NOT_FOUND");
  }

  const exactCount = countOccurrences(content, oldText);
  if (exactCount > 0) {
    if (!replaceAll && exactCount > 1) {
      throw new SmartEditError(
        "Found multiple exact matches. Add surrounding context or set replaceAll to true.",
        "AMBIGUOUS",
        { candidateCount: exactCount, candidatePreviews: [preview(oldText)] },
      );
    }
    return {
      content: replaceAll ? content.replaceAll(oldText, newText) : content.replace(oldText, newText),
      matchedText: oldText,
      replacementCount: replaceAll ? exactCount : 1,
      strategy: "exact",
    };
  }

  const candidates = uniqueCandidates([
    ...quoteNormalizedCandidates(content, oldText),
    ...lineTrimmedCandidates(content, oldText),
    ...whitespaceCandidates(content, oldText),
    ...anchorCandidates(content, oldText),
  ]);

  if (candidates.length === 0) {
    throw new SmartEditError("oldString was not found in the current file.", "NOT_FOUND", {
      closestMatchPreview: findClosestLine(content, oldText),
    });
  }

  for (const candidate of candidates) {
    const count = countOccurrences(content, candidate.text);
    if (replaceAll || count === 1) {
      const replacement = replacementWithQuoteStyle(candidate.text, newText);
      return {
        content: replaceAll ? content.replaceAll(candidate.text, replacement) : content.replace(candidate.text, replacement),
        matchedText: candidate.text,
        replacementCount: replaceAll ? count : 1,
        strategy: candidate.strategy,
      };
    }
  }

  throw new SmartEditError("Found multiple possible matches. Add more context to oldString.", "AMBIGUOUS", {
    candidateCount: candidates.length,
    candidatePreviews: candidates.map((candidate) => preview(candidate.text)).slice(0, 5),
  });
}
