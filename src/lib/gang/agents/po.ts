import { analyzeIntent } from "../intent";
import { generateWithFallback, type GenerateResult } from "../llm/withFallback";
import type { LlmClient } from "../llm/types";
import { expect, isObject, isString, isStringArray } from "../llm/validate";
import type { Intent, PoOutput, UserStory } from "../types";

function story(
  id: string,
  title: string,
  asA: string,
  iWant: string,
  soThat: string,
  acceptance: string[]
): UserStory {
  return { id, title, asA, iWant, soThat, acceptance };
}

export function runProductOwner(
  description: string,
  retrieved: { text: string }[],
  intent: Intent = analyzeIntent(description)
): PoOutput {
  const actor = intent.actor;
  const entity = intent.entityName.toLowerCase();
  const stories: UserStory[] = [
    story(
      "US-1",
      `Capture a new ${entity}`,
      actor,
      `create a ${entity} with the required fields`,
      "the team can record the request without losing details",
      intent.fields
        .filter((f) => f.required)
        .map((f) => `${f.label} is required and rejected when empty`)
        .concat(
          intent.fields.some((f) => f.type === "email")
            ? ["Email values must look like a valid address before save"]
            : []
        )
    ),
    story(
      "US-2",
      `Review ${intent.entityPlural.toLowerCase()}`,
      actor,
      `see a live list of ${intent.entityPlural.toLowerCase()} after each save`,
      "nothing is trapped in a one-off message or spreadsheet",
      [
        `An empty state explains how to add the first ${entity}`,
        "Newly created records appear at the top of the list",
        "Each row shows the identifying fields without extra navigation",
      ]
    ),
  ];

  if (intent.capabilities.search) {
    stories.push(
      story(
        "US-3",
        `Find a ${entity} quickly`,
        actor,
        "filter the list by a search query",
        "the team does not scroll through unrelated records",
        ["Search matches across visible text fields", "Clearing the query restores the full list"]
      )
    );
  }

  if (intent.capabilities.exportCsv) {
    stories.push(
      story(
        "US-4",
        "Export the current set",
        actor,
        "download a CSV of the visible records",
        "the data can move into existing reporting tools",
        ["CSV includes a header row for every field", "Export uses the filtered list when search is active"]
      )
    );
  }

  if (intent.capabilities.status) {
    stories.push(
      story(
        "US-5",
        `Move a ${entity} through statuses`,
        actor,
        "update status without rewriting the whole record",
        "progress is visible to the rest of the squad",
        ["Status only accepts the agreed values", "The list reflects the new status immediately"]
      )
    );
  }

  const risks: PoOutput["risks"] = [
    {
      title: "Ambiguous required fields",
      severity: intent.fields.filter((f) => f.required).length < 1 ? "high" : "low",
      mitigation: "PO listed required fields in acceptance criteria before development.",
    },
    {
      title: "Unvalidated input",
      severity: intent.fields.some((f) => f.type === "email") ? "medium" : "low",
      mitigation: "QA must fail the run if required validation is missing from generated code.",
    },
  ];

  if (intent.capabilities.auth) {
    risks.push({
      title: "Auth surface without a dedicated identity service",
      severity: "medium",
      mitigation:
        "This slice records the actor in stories but does not stand up a new identity provider. Human review is required before adding login.",
    });
  }

  const memoryHint = retrieved[0]
    ? `Retrieved memory applied: ${retrieved[0].text}`
    : "No prior feature memory matched closely; using company conventions.";

  return {
    epic: `${intent.title} delivery`,
    summary: `${description.trim()} ${memoryHint}`,
    stories,
    risks,
    scope: [
      `Create and list ${intent.entityPlural.toLowerCase()}`,
      `Typed fields: ${intent.fields.map((f) => f.label).join(", ")}`,
      intent.capabilities.search ? "Search/filter the live list" : "Keep the list readable without extra chrome",
      intent.capabilities.exportCsv ? "CSV export of the current view" : null,
      "Human approval of the plan and of generated code",
    ].filter((item): item is string => Boolean(item)),
    outOfScope: [
      "Multi-tenant billing and SSO",
      intent.capabilities.realtime ? "True websocket fan-out (preview stays local)" : "Realtime collaboration",
      "Mobile native clients",
    ],
  };
}

function parseUserStory(x: unknown, index: number): UserStory {
  expect(isObject(x), `stories[${index}] is not an object`);
  const { id, title, asA, iWant, soThat, acceptance } = x;
  expect(isString(id) && isString(title) && isString(asA) && isString(iWant) && isString(soThat), `stories[${index}] is missing a required string field`);
  expect(isStringArray(acceptance), `stories[${index}].acceptance is not a string array`);
  return { id, title, asA, iWant, soThat, acceptance };
}

function parseRisk(x: unknown, index: number): PoOutput["risks"][number] {
  expect(isObject(x), `risks[${index}] is not an object`);
  const { title, severity, mitigation } = x;
  expect(isString(title) && isString(mitigation), `risks[${index}] is missing title/mitigation`);
  expect(severity === "low" || severity === "medium" || severity === "high", `risks[${index}].severity is not low/medium/high`);
  return { title, severity, mitigation };
}

export function parsePoOutput(json: unknown): PoOutput {
  expect(isObject(json), "response is not an object");
  const { epic, summary, stories, risks, scope, outOfScope } = json;
  expect(isString(epic) && isString(summary), "epic/summary missing");
  expect(Array.isArray(stories) && stories.length > 0, "stories is empty or not an array");
  expect(Array.isArray(risks), "risks is not an array");
  expect(isStringArray(scope) && isStringArray(outOfScope), "scope/outOfScope is not a string array");
  return {
    epic,
    summary,
    stories: stories.map(parseUserStory),
    risks: risks.map(parseRisk),
    scope,
    outOfScope,
  };
}

const PO_SYSTEM_PROMPT = `You are the Product Owner in a small engineering "gang" (PO, BA, DEV, QA). Given a one-line feature brief, write a concrete delivery spec.

Respond with ONLY a single JSON object, no prose, no markdown code fence, matching exactly this shape:
{
  "epic": string,
  "summary": string (1-2 sentences, references the brief),
  "stories": [{ "id": "US-1", "title": string, "asA": string (an actor/role), "iWant": string, "soThat": string, "acceptance": string[] }],
  "risks": [{ "title": string, "severity": "low"|"medium"|"high", "mitigation": string }],
  "scope": string[],
  "outOfScope": string[]
}
Write at least 2 stories and at least 1 risk. Keep acceptance criteria concrete and testable.`;

export async function producePoOutput(
  client: LlmClient | null,
  description: string,
  retrieved: { text: string }[],
  intent: Intent = analyzeIntent(description)
): Promise<GenerateResult<PoOutput>> {
  const memoryContext = retrieved.length
    ? `Relevant prior conventions:\n${retrieved.map((r) => `- ${r.text}`).join("\n")}`
    : "No prior conventions matched.";
  const prompt = `Feature brief: "${description}"\nEntity: ${intent.entityName} (actor: ${intent.actor})\nFields: ${intent.fields.map((f) => `${f.name}:${f.type}${f.required ? "*" : ""}`).join(", ")}\n${memoryContext}`;

  return generateWithFallback({
    client,
    system: PO_SYSTEM_PROMPT,
    prompt,
    parse: parsePoOutput,
    fallback: () => runProductOwner(description, retrieved, intent),
  });
}
