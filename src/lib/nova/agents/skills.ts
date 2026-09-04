import type { DevOutput, PoOutput, SkillOutput } from "../types";

export function runSkills(
  skillIds: string[],
  po: PoOutput,
  dev: DevOutput
): SkillOutput[] {
  return skillIds.map((id) => {
    if (id === "code-review") return codeReview(dev);
    if (id === "security-audit") return securityAudit(dev);
    if (id === "documentation") return documentation(po, dev);
    return {
      id,
      name: id,
      findings: [{ title: "Unknown skill", detail: "Skill is not in the marketplace.", severity: "warn" }],
    };
  });
}

function codeReview(dev: DevOutput): SkillOutput {
  const joined = dev.files.map((f) => f.content).join("\n");
  return {
    id: "code-review",
    name: "Code Review",
    findings: [
      {
        title: "Typed domain boundary",
        detail: "Validation lives next to the type, so API and UI share one contract.",
        severity: "pass",
      },
      {
        title: "Store isolation",
        detail: joined.includes("const records")
          ? "In-memory store is module-scoped — swap for a table without changing handlers."
          : "Could not confirm a dedicated store module.",
        severity: joined.includes("const records") ? "pass" : "warn",
      },
      {
        title: "Component size",
        detail:
          (dev.files.find((f) => f.path.endsWith("-board.tsx"))?.content.split("\n").length ?? 0) > 220
            ? "Board component is getting large; split form and list on the next pass."
            : "Board component stays within a reviewable size.",
        severity: "info",
      },
    ],
  };
}

function securityAudit(dev: DevOutput): SkillOutput {
  const joined = dev.files.map((f) => f.content).join("\n");
  const hasEmail = dev.preview.fields.some((f) => f.type === "email");
  return {
    id: "security-audit",
    name: "Security Audit",
    findings: [
      {
        title: "Secrets",
        detail: joined.includes("sk-") || joined.includes("API_KEY")
          ? "Possible secret material in generated files."
          : "No API keys or secrets baked into generated source.",
        severity: joined.includes("sk-") ? "warn" : "pass",
      },
      {
        title: "Input validation",
        detail: joined.includes("validate")
          ? "Create path rejects invalid payloads before they enter the store."
          : "No validator detected.",
        severity: joined.includes("validate") ? "pass" : "warn",
      },
      {
        title: "Email handling",
        detail: hasEmail
          ? "Email is validated but not verified via an out-of-band token in this slice."
          : "No email field in this feature.",
        severity: hasEmail ? "info" : "pass",
      },
    ],
  };
}

function documentation(po: PoOutput, dev: DevOutput): SkillOutput {
  const readme = dev.files.find((f) => f.path.endsWith(".md"));
  return {
    id: "documentation",
    name: "Documentation",
    findings: [
      {
        title: "Feature README",
        detail: readme ? `${readme.path} lists entity, fields, and API.` : "README missing.",
        severity: readme ? "pass" : "warn",
      },
      {
        title: "Stories to docs",
        detail: `${po.stories.length} user stories remain the source of acceptance; QA mapped them onto generated files.`,
        severity: "info",
      },
    ],
  };
}
