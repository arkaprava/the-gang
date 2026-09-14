import { analyzeIntent } from "../intent";
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
