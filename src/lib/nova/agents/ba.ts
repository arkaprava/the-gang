import { LLM_CATALOG } from "../catalog";
import { toKebab } from "../text";
import type { BaOutput, Intent, LlmId } from "../types";

export function runBusinessAnalyst(
  intent: Intent,
  model: LlmId,
  retrieved: { text: string }[]
): BaOutput {
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
    {
      name: LLM_CATALOG[model].name,
      reason: LLM_CATALOG[model].local
        ? "Local model — architecture work stays on-prem with no API bill."
        : "Highest-quality reasoning for stack and data-model choices.",
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
