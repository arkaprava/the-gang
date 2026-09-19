// Every prompt in this module instructs the model to respond with JSON only,
// no prose, no code fence — but models don't always comply, so this strips a
// stray ```json ... ``` (or bare ```...```) fence before parsing, as a safety
// net rather than the primary mechanism. Throws (does not return
// undefined/null) on anything that isn't valid JSON, so callers can treat
// "extraction failed" and "JSON.parse failed" identically.
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}
