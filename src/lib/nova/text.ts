const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "for",
  "with",
  "that",
  "this",
  "in",
  "on",
  "at",
  "by",
  "from",
  "add",
  "build",
  "create",
  "implement",
  "make",
  "ship",
  "need",
  "want",
  "please",
  "our",
  "we",
  "i",
  "my",
  "using",
  "which",
  "into",
  "able",
  "can",
  "should",
  "feature",
  "app",
  "application",
  "system",
  "page",
  "form",
  "list",
  "dashboard",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function toPascal(words: string[]): string {
  return words
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

export function toCamel(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function toKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("ch")) return `${word}es`;
  return `${word}s`;
}

export function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function firstSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const match = trimmed.match(/^[^.!?]+[.!?]?/);
  return match ? match[0].trim() : trimmed.slice(0, 140);
}
