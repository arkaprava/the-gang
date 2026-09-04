import { toCamel } from "../text";
import type { DataField, DevOutput, GeneratedFile, Intent, PreviewSpec } from "../types";

function tsType(field: DataField): string {
  if (field.type === "number") return "number";
  if (field.type === "boolean") return "boolean";
  return "string";
}

function validator(field: DataField): string {
  const value = `input.${field.name}`;
  if (field.type === "email") {
    return `  if (${field.required ? `!${value} || ` : `${value} && `}!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(${value}))) {
    errors.push("${field.label} must be a valid email");
  }`;
  }
  if (field.type === "number") {
    return `  if (${field.required ? `${value} === undefined || ${value} === null || ` : ""}Number.isNaN(Number(${value}))) {
    errors.push("${field.label} must be a number");
  }`;
  }
  if (field.type === "select" && field.options?.length) {
    const opts = field.options.map((o) => `"${o}"`).join(", ");
    return `  if (${field.required ? `!${value} || ` : `${value} && `}![${opts}].includes(String(${value}))) {
    errors.push("${field.label} must be one of: ${field.options.join(", ")}");
  }`;
  }
  if (field.required) {
    return `  if (${value} === undefined || ${value} === null || String(${value}).trim() === "") {
    errors.push("${field.label} is required");
  }`;
  }
  return `  // ${field.label} is optional`;
}

function inputType(field: DataField): string {
  if (field.type === "email") return "email";
  if (field.type === "number") return "number";
  if (field.type === "date") return "date";
  if (field.type === "boolean") return "checkbox";
  return "text";
}

export function runDeveloper(intent: Intent): DevOutput {
  const entity = intent.entityName;
  const camel = toCamel(entity);
  const slug = intent.slug;
  const typeName = entity;
  const fields = intent.fields;

  const typeFields = fields.map((f) => `  ${f.name}: ${tsType(f)};`).join("\n");

  const typesFile: GeneratedFile = {
    path: `src/types/${slug}.ts`,
    language: "ts",
    content: `export type ${typeName} = {
  id: string;
  createdAt: string;
${typeFields}
};

export type ${typeName}Input = Omit<${typeName}, "id" | "createdAt">;

export function validate${entity}(input: Partial<${typeName}Input>): string[] {
  const errors: string[] = [];
${fields.map(validator).join("\n")}
  return errors;
}
`,
  };

  const storeFile: GeneratedFile = {
    path: `src/lib/${slug}-store.ts`,
    language: "ts",
    content: `import { randomUUID } from "node:crypto";
import type { ${typeName}, ${typeName}Input } from "@/types/${slug}";
import { validate${entity} } from "@/types/${slug}";

const records: ${typeName}[] = [];

export function list${intent.entityPlural}(query = "") {
  const q = query.trim().toLowerCase();
  const rows = q
    ? records.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
    : records;
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function create${entity}(input: ${typeName}Input) {
  const errors = validate${entity}(input);
  if (errors.length) {
    return { ok: false as const, errors };
  }
  const record: ${typeName} = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
  records.unshift(record);
  return { ok: true as const, record };
}

export function delete${entity}(id: string) {
  const index = records.findIndex((row) => row.id === id);
  if (index === -1) return false;
  records.splice(index, 1);
  return true;
}

export function toCsv(rows: ${typeName}[]) {
  const headers = ["id", "createdAt", ${fields.map((f) => `"${f.name}"`).join(", ")}];
  const escape = (value: unknown) => \`"\${String(value ?? "").replaceAll('"', '""')}"\`;
  return [headers.join(","), ...rows.map((row) => headers.map((key) => escape((row as Record<string, unknown>)[key])).join(","))].join("\\n");
}
`,
  };

  const apiFile: GeneratedFile = {
    path: `src/app/api/${slug}/route.ts`,
    language: "ts",
    content: `import { NextResponse } from "next/server";
import { create${entity}, list${intent.entityPlural} } from "@/lib/${slug}-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  return NextResponse.json({ data: list${intent.entityPlural}(query) });
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = create${entity}(body);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }
  return NextResponse.json({ data: result.record }, { status: 201 });
}
`,
  };

  const deleteApiFile: GeneratedFile = {
    path: `src/app/api/${slug}/[id]/route.ts`,
    language: "ts",
    content: `import { NextResponse } from "next/server";
import { delete${entity} } from "@/lib/${slug}-store";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = delete${entity}(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
`,
  };

  const fieldInputs = fields
    .map((field) => {
      if (field.type === "text") {
        return `        <label className="grid gap-1 text-sm">
          <span>${field.label}${field.required ? " *" : ""}</span>
          <textarea name="${field.name}" ${field.required ? "required" : ""} className="rounded-lg border px-3 py-2" />
        </label>`;
      }
      if (field.type === "select") {
        const opts = (field.options ?? []).map((o) => `            <option value="${o}">${o}</option>`).join("\n");
        return `        <label className="grid gap-1 text-sm">
          <span>${field.label}${field.required ? " *" : ""}</span>
          <select name="${field.name}" ${field.required ? "required" : ""} className="rounded-lg border px-3 py-2">
            <option value="">Select…</option>
${opts}
          </select>
        </label>`;
      }
      if (field.type === "boolean") {
        return `        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="${field.name}" />
          <span>${field.label}</span>
        </label>`;
      }
      return `        <label className="grid gap-1 text-sm">
          <span>${field.label}${field.required ? " *" : ""}</span>
          <input name="${field.name}" type="${inputType(field)}" ${field.required ? "required" : ""} className="rounded-lg border px-3 py-2" />
        </label>`;
  })
    .join("\n");

  const componentFile: GeneratedFile = {
    path: `src/components/${slug}-board.tsx`,
    language: "tsx",
    content: `"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ${typeName} } from "@/types/${slug}";

export function ${entity}Board() {
  const [items, setItems] = useState<${typeName}[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh(q = query) {
    const res = await fetch(\`/api/${slug}?q=\${encodeURIComponent(q)}\`);
    const json = await res.json();
    setItems(json.data ?? []);
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await fetch("/api/${slug}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      setError((json.errors ?? ["Could not save"]).join(". "));
      return;
    }
    form.reset();
    await refresh();
  }

  const visible = useMemo(() => items, [items]);

  return (
    <section className="grid gap-6">
      <form onSubmit={onCreate} className="grid gap-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">New ${entity}</h2>
${fieldInputs}
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Save ${entity}</button>
      </form>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>Search</span>
          <input value={query} onChange={(e) => { setQuery(e.target.value); void refresh(e.target.value); }} />
        </label>
        {visible.length === 0 ? (
          <p>No ${intent.entityPlural.toLowerCase()} yet. Add the first one to populate this list.</p>
        ) : (
          <ul>
            {visible.map((item) => (
              <li key={item.id}>{JSON.stringify(item)}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
`,
  };

  const testFile: GeneratedFile = {
    path: `src/types/${slug}.test.ts`,
    language: "ts",
    content: `import { validate${entity} } from "./${slug}";

const valid = {
${fields
  .map((f) => {
    if (f.type === "email") return `  ${f.name}: "alex@company.com",`;
    if (f.type === "number") return `  ${f.name}: 3,`;
    if (f.type === "boolean") return `  ${f.name}: true,`;
    if (f.type === "select") return `  ${f.name}: "${f.options?.[0] ?? "Open"}",`;
    if (f.type === "date") return `  ${f.name}: "2026-09-04",`;
    return `  ${f.name}: "Example ${f.label}",`;
  })
  .join("\n")}
};

export function run${entity}Tests() {
  const passEmpty = validate${entity}({}).length > 0;
  const passValid = validate${entity}(valid).length === 0;
  return { passEmpty, passValid };
}
`,
  };

  const readme: GeneratedFile = {
    path: `docs/${slug}.md`,
    language: "md",
    content: `# ${intent.title}

Shipped by Nova Developer agent.

## Entity
\`${entity}\` at \`/api/${slug}\`

## Fields
${fields.map((f) => `- **${f.label}** (\`${f.name}\`, ${f.type}${f.required ? ", required" : ""})`).join("\n")}

## API
- \`GET /api/${slug}?q=\`
- \`POST /api/${slug}\`
- \`DELETE /api/${slug}/[id]\`
`,
  };

  const preview: PreviewSpec = {
    title: intent.title,
    entityName: entity,
    entityPlural: intent.entityPlural,
    slug,
    fields,
    features: {
      search: intent.capabilities.search,
      exportCsv: intent.capabilities.exportCsv,
      create: true,
      delete: true,
      status: intent.capabilities.status,
    },
  };

  return {
    files: [typesFile, storeFile, apiFile, deleteApiFile, componentFile, testFile, readme],
    preview,
    notes: [
      `Generated ${7} production files for ${entity}.`,
      "Preview runs the same validation rules as the typed domain module.",
      `${camel} store keeps records in memory so Product can click through the feature immediately.`,
    ],
  };
}
