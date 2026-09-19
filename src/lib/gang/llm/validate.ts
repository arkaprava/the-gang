// Small hand-rolled shape-validation helpers shared by every agent's LLM
// response parser — no schema library, matching this repo's existing style
// of hand-written validators (see src/lib/gang/agents/dev.ts's generated
// `validate${Entity}` functions). `expect` throws on failure so a parser can
// read as a flat list of assertions; `generateWithFallback` treats any throw
// from `parse` as "fall back to the deterministic template."
export function isString(x: unknown): x is string {
  return typeof x === "string";
}

export function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(isString);
}

export function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`invalid LLM response shape: ${message}`);
}
