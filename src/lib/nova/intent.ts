import type { DataField, Intent } from "./types";
import { firstSentence, pluralize, titleCase, toKebab, tokenize, toPascal } from "./text";

function has(text: string, ...needles: string[]) {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

function deriveEntity(description: string) {
  const cleaned = description
    .toLowerCase()
    .replace(/^(add|build|create|implement|make|ship|need|want|please)\s+(a|an|the)?\s*/i, "");
  const head = cleaned.split(/\b(with|that|which|using|so that|for)\b/)[0] ?? cleaned;
  const words = tokenize(head).slice(0, 3);
  const fallback = tokenize(description).slice(0, 2);
  const chosen = (words.length ? words : fallback).slice(0, 2);
  const entityName = toPascal(chosen.length ? chosen : ["item"]);
  const entityPlural = pluralize(entityName);
  return {
    entityName,
    entityPlural,
    slug: toKebab(entityName) || "item",
    title: titleCase(chosen.join(" ") || "New Feature"),
  };
}

function deriveFields(description: string, entityName: string): DataField[] {
  const fields: DataField[] = [];
  const push = (field: DataField) => {
    if (!fields.some((f) => f.name === field.name)) fields.push(field);
  };

  if (has(description, "email", "signup", "waitlist", "subscribe", "contact", "invite")) {
    push({ name: "email", label: "Email", type: "email", required: true });
  }
  if (has(description, "name", "person", "user", "customer", "owner", "assignee")) {
    push({ name: "name", label: "Name", type: "string", required: true });
  }
  if (has(description, "title", "task", "ticket", "issue", "post", "article", "project")) {
    push({ name: "title", label: "Title", type: "string", required: true });
  }
  if (has(description, "description", "notes", "comment", "message", "body", "details")) {
    push({ name: "notes", label: "Notes", type: "text", required: false });
  }
  if (has(description, "status", "state", "stage", "kanban", "pipeline", "progress")) {
    push({
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      options: has(description, "kanban")
        ? ["Backlog", "In progress", "Review", "Done"]
        : ["Open", "In progress", "Blocked", "Done"],
    });
  }
  if (has(description, "priority", "p0", "severity", "urgent")) {
    push({
      name: "priority",
      label: "Priority",
      type: "select",
      required: true,
      options: ["Low", "Medium", "High", "Critical"],
    });
  }
  if (has(description, "price", "amount", "cost", "budget", "qty", "quantity", "count")) {
    push({ name: "amount", label: "Amount", type: "number", required: true });
  }
  if (has(description, "date", "when", "deadline", "due", "schedule", "booking")) {
    push({ name: "dueAt", label: "Due date", type: "date", required: false });
  }
  if (has(description, "tag", "label", "category", "type")) {
    push({ name: "category", label: "Category", type: "string", required: false });
  }
  if (has(description, "phone", "mobile", "sms")) {
    push({ name: "phone", label: "Phone", type: "string", required: false });
  }
  if (has(description, "company", "org", "organization", "team")) {
    push({ name: "company", label: "Company", type: "string", required: false });
  }
  if (has(description, "url", "link", "website")) {
    push({ name: "url", label: "URL", type: "string", required: false });
  }
  if (has(description, "active", "enabled", "published", "approved")) {
    push({ name: "enabled", label: "Enabled", type: "boolean", required: true });
  }

  if (!fields.length) {
    push({ name: "title", label: `${entityName} title`, type: "string", required: true });
    push({ name: "notes", label: "Notes", type: "text", required: false });
  }

  if (!fields.some((f) => f.required)) {
    fields[0].required = true;
  }

  return fields;
}

function deriveActor(description: string) {
  const lower = description.toLowerCase();
  if (lower.includes("admin")) return "admin";
  if (lower.includes("customer") || lower.includes("buyer")) return "customer";
  if (lower.includes("engineer") || lower.includes("developer")) return "engineer";
  if (lower.includes("manager")) return "manager";
  if (lower.includes("user")) return "user";
  return "teammate";
}

export function analyzeIntent(description: string): Intent {
  const entity = deriveEntity(description);
  const fields = deriveFields(description, entity.entityName);
  return {
    ...entity,
    title: entity.title,
    actor: deriveActor(description),
    fields,
    capabilities: {
      search: has(description, "search", "filter", "find", "query") || fields.length > 2,
      exportCsv: has(description, "csv", "export", "download", "report"),
      auth: has(description, "auth", "login", "sign in", "permission", "role"),
      dashboard: has(description, "dashboard", "analytics", "metric", "stats"),
      status: fields.some((f) => f.name === "status"),
      realtime: has(description, "realtime", "real-time", "live", "websocket"),
    },
    keywords: tokenize(description),
  };
}

export function runTitle(description: string): string {
  const intent = analyzeIntent(description);
  const sentence = firstSentence(description);
  if (sentence.length <= 64) return sentence.replace(/\.$/, "");
  return intent.title;
}
