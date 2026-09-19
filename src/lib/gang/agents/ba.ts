import { generateWithFallback, type GenerateResult } from "../llm/withFallback";
import type { LlmClient } from "../llm/types";
import { expect, isObject, isString, isStringArray } from "../llm/validate";
import { toKebab } from "../text";
import type { BaOutput, Intent } from "../types";

export function runBusinessAnalyst(intent: Intent, retrieved: { text: string }[]): BaOutput {
  const slug = intent.slug;
  const convention = retrieved.find((m) => m.text.toLowerCase().includes("stack"))?.text;

  const stack = [
    {
      name: "TypeScript",
      reason: "Matches generated API contracts and keeps field types aligned with the PO spec.",
    },
    {
      name: "Next.js Route Handlers",
      reason: "Feature ships as REST handlers the squad can copy into a real app.",
    },
  ];

  if (convention) {
    stack.push({
      name: "Company memory",
      reason: convention,
    });
  }

  return {
    stack,
    entities: [{ name: intent.entityName, fields: intent.fields }],
    apis: [
      {
        method: "GET",
        path: `/api/${slug}`,
        purpose: `List ${intent.entityPlural.toLowerCase()}`,
      },
      {
        method: "POST",
        path: `/api/${slug}`,
        purpose: `Create a ${intent.entityName.toLowerCase()} after validation`,
      },
      {
        method: "DELETE",
        path: `/api/${slug}/[id]`,
        purpose: `Remove a ${intent.entityName.toLowerCase()}`,
      },
    ],
    approach: [
      "Keep a typed domain module as the source of truth for fields and validation.",
      "Use an in-memory store with the same shape a database table would have.",
      "Expose REST handlers that the Developer agent implements in one pass.",
      "Render a working preview from the same spec so Product can click the feature before QA.",
      intent.capabilities.exportCsv
        ? "CSV export is a pure function over the filtered list — no extra service."
        : "Skip extra export infrastructure until a later slice.",
    ],
    dataModelNotes: `${intent.entityName} (${toKebab(intent.entityName)}) owns: ${intent.fields
      .map((f) => `${f.name}:${f.type}${f.required ? "*" : ""}`)
      .join(", ")}. Records always include id and createdAt.`,
  };
}

// Deliberately narrow: the LLM only ever supplies prose (why each stack
// choice was made, the approach bullets, the data-model narrative). The
// *structural* facts — which stack items exist, the entity/field list, the
// API routes — always come from `intent` via the deterministic function
// above, so BA's documented API/entity list can never drift from what DEV
// actually generates, and there's no array-of-objects for the LLM to
// reorder or resize.
type BaProse = { stackReasons: string[]; approach: string[]; dataModelNotes: string };

function parseBaProse(json: unknown): BaProse {
  expect(isObject(json), "response is not an object");
  const { stackReasons, approach, dataModelNotes } = json;
  expect(isStringArray(stackReasons), "stackReasons is not a string array");
  expect(isStringArray(approach) && approach.length > 0, "approach is empty or not a string array");
  expect(isString(dataModelNotes) && dataModelNotes.length > 0, "dataModelNotes is missing");
  return { stackReasons, approach, dataModelNotes };
}

const BA_SYSTEM_PROMPT = `You are the Business Analyst in a small engineering "gang" (PO, BA, DEV, QA). Given the chosen stack items and the data model, write the reasoning prose only.

Respond with ONLY a single JSON object, no prose, no markdown code fence, matching exactly this shape:
{
  "stackReasons": string[] (one sentence per stack item given, in the SAME ORDER, explaining why it fits this feature),
  "approach": string[] (3-5 bullets describing the implementation approach),
  "dataModelNotes": string (1-2 sentences describing the entity and its fields)
}
Do not invent stack items, entities, or API routes — only write prose for what you're given.`;

export async function produceBaOutput(
  client: LlmClient | null,
  intent: Intent,
  retrieved: { text: string }[]
): Promise<GenerateResult<BaOutput>> {
  const deterministic = runBusinessAnalyst(intent, retrieved);
  const prompt = `Stack items (respond with one reason per item, in order): ${deterministic.stack.map((s) => s.name).join(", ")}\nEntity: ${intent.entityName}\nFields: ${intent.fields.map((f) => `${f.name}:${f.type}${f.required ? "*" : ""}`).join(", ")}\nCSV export in scope: ${intent.capabilities.exportCsv}`;

  return generateWithFallback({
    client,
    system: BA_SYSTEM_PROMPT,
    prompt,
    parse: (json) => {
      const prose = parseBaProse(json);
      expect(
        prose.stackReasons.length === deterministic.stack.length,
        `stackReasons has ${prose.stackReasons.length} entries, expected ${deterministic.stack.length}`
      );
      return {
        ...deterministic,
        stack: deterministic.stack.map((item, i) => ({ ...item, reason: prose.stackReasons[i] })),
        approach: prose.approach,
        dataModelNotes: prose.dataModelNotes,
      };
    },
    fallback: () => deterministic,
  });
}
