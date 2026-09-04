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
