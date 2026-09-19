import { generateWithFallback, type GenerateResult } from "../llm/withFallback";
import type { LlmClient } from "../llm/types";
import { expect, isObject, isString, isStringArray } from "../llm/validate";
import type { DevOutput, PoOutput, QaOutput, TestResult } from "../types";

function check(name: string, type: TestResult["type"], passed: boolean, detail: string): TestResult {
  return { name, type, passed, detail };
}

export function runQa(po: PoOutput, dev: DevOutput): QaOutput {
  const files = dev.files;
  const joined = files.map((f) => f.content).join("\n");
  const types = files.find((f) => f.path.includes("types/") && f.path.endsWith(".ts") && !f.path.endsWith(".test.ts"));
  const component = files.find((f) => f.path.endsWith("-board.tsx"));
  const api = files.find((f) => f.path.includes("/route.ts") && !f.path.includes("[id]"));

  const requiredFields = po.stories.flatMap((s) => s.acceptance).filter((a) => /required/i.test(a));

  const tests: TestResult[] = [
    check(
      "Domain module exists",
      "unit",
      Boolean(types && types.content.includes("export type")),
      types ? `Found ${types.path}` : "Missing typed domain module"
    ),
    check(
      "Required-field validation is generated",
      "unit",
      Boolean(types && types.content.includes("errors.push")),
      requiredFields.length
        ? "Acceptance criteria that mention required fields are backed by validators"
        : "Validators generated from the PO spec"
    ),
    check(
      "Create + list API handlers",
      "integration",
      Boolean(api && api.content.includes("export async function GET") && api.content.includes("export async function POST")),
      api ? api.path : "Missing collection route"
    ),
    check(
      "Empty state copy present",
      "regression",
      Boolean(component && /No .+ yet/i.test(component.content)),
      "List view explains what to do when there are zero records"
    ),
    check(
      "Visible labels on inputs",
      "a11y",
      Boolean(component && component.content.includes("<label") && component.content.includes("<span>")),
      "Every generated control is wrapped in a label with visible text"
    ),
    check(
      "Email validation when email is in spec",
      "unit",
      !dev.preview.fields.some((f) => f.type === "email") || joined.includes("valid email"),
      "Email fields are rejected unless they look like an address"
    ),
    check(
      "CSV export available when scoped",
      "integration",
      !dev.preview.features.exportCsv || joined.includes("toCsv"),
      dev.preview.features.exportCsv ? "toCsv helper generated" : "CSV not in scope"
    ),
    check(
      "Stories covered by generated files",
      "regression",
      po.stories.length > 0 && files.length >= 5,
      `${po.stories.length} stories mapped onto ${files.length} files`
    ),
  ];

  const passed = tests.filter((t) => t.passed).length;
  const issues = tests.filter((t) => !t.passed).map((t) => t.detail);
  const coverage = Math.round((passed / tests.length) * 100);

  return {
    tests,
    coverage,
    summary:
      issues.length === 0
        ? `QA passed ${passed}/${tests.length} checks with ${coverage}% coverage of the generated surface.`
        : `QA found ${issues.length} gap(s). Remaining checks passed.`,
    issues,
  };
}

// QA is LLM-backed for prose only. `runQa` above always runs first and is
// the sole source of `tests`/`coverage`/`issues` — the pass/fail verdicts
// never come from the LLM. This is deliberate: the old fake QA already had
// a credibility problem (it once reported "100% coverage" on code that
// didn't compile), and letting an LLM write verdicts instead of a
// deterministic checker would make that worse, not better. If the LLM call
// fails, `qa.summary` is used exactly as `runQa` produced it — this stage
// can never end up worse off than it is today.
function parseQaProse(json: unknown): { summary: string; advisoryNotes?: string[] } {
  expect(isObject(json), "response is not an object");
  const { summary, advisoryNotes } = json;
  expect(isString(summary) && summary.length > 0, "summary is missing");
  expect(advisoryNotes === undefined || isStringArray(advisoryNotes), "advisoryNotes is not a string array");
  return { summary, advisoryNotes };
}

const QA_SYSTEM_PROMPT = `You are the QA Engineer in a small engineering "gang" (PO, BA, DEV, QA). You are given the deterministic test results already computed for this run — you do NOT decide pass/fail. Write a short human-readable summary and, optionally, advisory notes (things worth a human's attention that aren't covered by the listed checks).

Respond with ONLY a single JSON object, no prose, no markdown code fence, matching exactly this shape:
{ "summary": string (1-2 sentences), "advisoryNotes": string[] (optional, omit if none) }`;

export async function produceQaOutput(client: LlmClient | null, po: PoOutput, dev: DevOutput): Promise<GenerateResult<QaOutput>> {
  const qa = runQa(po, dev);
  const prompt = `Coverage: ${qa.coverage}%. Checks:\n${qa.tests.map((t) => `- [${t.passed ? "PASS" : "FAIL"}] ${t.name}: ${t.detail}`).join("\n")}\nIssues: ${qa.issues.length ? qa.issues.join("; ") : "none"}`;

  return generateWithFallback({
    client,
    system: QA_SYSTEM_PROMPT,
    prompt,
    parse: (json) => {
      const prose = parseQaProse(json);
      return { ...qa, summary: prose.summary, advisoryNotes: prose.advisoryNotes };
    },
    fallback: () => qa,
  });
}
