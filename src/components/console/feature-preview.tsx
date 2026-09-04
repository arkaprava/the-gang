"use client";

import { useState, type FormEvent } from "react";
import type { DataField, PreviewSpec } from "@/lib/nova/types";

type RecordRow = Record<string, string> & { id: string; createdAt: string };

const rowMemory = new Map<string, RecordRow[]>();

function storageKeyFor(slug: string) {
  return `nova-preview:${slug}`;
}

function loadRows(slug: string): RecordRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKeyFor(slug));
    return raw ? (JSON.parse(raw) as RecordRow[]) : [];
  } catch {
    return [];
  }
}

function persistRows(slug: string, rows: RecordRow[]) {
  rowMemory.set(slug, rows);
  try {
    sessionStorage.setItem(storageKeyFor(slug), JSON.stringify(rows));
  } catch {
    /* ignore quota */
  }
}

function rowsFor(slug: string): RecordRow[] {
  const cached = rowMemory.get(slug);
  if (cached) return cached;
  const loaded = loadRows(slug);
  rowMemory.set(slug, loaded);
  return loaded;
}

function validate(fields: DataField[], values: Record<string, string>) {
  const errors: string[] = [];
  for (const field of fields) {
    const value = values[field.name]?.trim() ?? "";
    if (field.required && !value && field.type !== "boolean") {
      errors.push(`${field.label} is required`);
    }
    if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`${field.label} must be a valid email`);
    }
    if (field.type === "number" && value && Number.isNaN(Number(value))) {
      errors.push(`${field.label} must be a number`);
    }
    if (field.type === "select" && field.options && value && !field.options.includes(value)) {
      errors.push(`${field.label} is not an allowed value`);
    }
  }
  return errors;
}

function readDraft(form: HTMLFormElement, fields: DataField[]) {
  const data = new FormData(form);
  return Object.fromEntries(
    fields.map((field) => {
      if (field.type === "boolean") {
        const raw = data.get(field.name);
        return [field.name, raw === "true" || raw === "on" ? "true" : "false"];
      }
      return [field.name, String(data.get(field.name) ?? "")];
    })
  );
}

function FieldControl({ field }: { field: DataField }) {
  const className =
    "h-10 w-full rounded-lg border border-nova-border-lit bg-nova-bg2 px-3 text-sm text-nova-text outline-none focus:border-nova-purple";
  if (field.type === "text") {
    return (
      <textarea
        name={field.name}
        className="min-h-20 w-full rounded-lg border border-nova-border-lit bg-nova-bg2 px-3 py-2 text-sm text-nova-text outline-none focus:border-nova-purple"
      />
    );
  }
  if (field.type === "select") {
    return (
      <select name={field.name} className={className} defaultValue="">
        <option value="">Select…</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="flex h-10 items-center gap-2 text-sm text-nova-muted">
        <input type="checkbox" name={field.name} value="true" />
        Enabled
      </label>
    );
  }
  const inputType =
    field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return <input name={field.name} type={inputType} className={className} />;
}

export function FeaturePreview({ spec }: { spec: PreviewSpec }) {
  const [rows, setRows] = useState<RecordRow[]>(() => rowsFor(spec.slug));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const visible = query.trim()
    ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))
    : rows;

  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.currentTarget;
    const draft = readDraft(form, spec.fields);
    const errors = validate(spec.fields, draft);
    if (errors.length) {
      setError(errors.join(". "));
      setFlash(null);
      return;
    }
    const next: RecordRow = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...draft,
    };
    const nextRows = [next, ...rowsFor(spec.slug)];
    persistRows(spec.slug, nextRows);
    setError(null);
    setRows(nextRows);
    form.reset();
    setFlash(`Saved ${next[spec.fields[0]?.name] || spec.entityName}.`);
  }

  function removeRow(id: string) {
    const nextRows = rowsFor(spec.slug).filter((row) => row.id !== id);
    persistRows(spec.slug, nextRows);
    setRows(nextRows);
  }

  function exportCsv() {
    const headers = ["id", "createdAt", ...spec.fields.map((f) => f.name)];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      headers.join(","),
      ...visible.map((row) => headers.map((key) => escape(row[key])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-5">
      <form
        className="grid gap-3 rounded-xl border border-nova-border bg-nova-bg2/50 p-4"
        method="dialog"
        onSubmit={saveRecord}
      >
        <div className="text-sm font-semibold">New {spec.entityName}</div>
        {spec.fields.map((field) => (
          <label key={field.name} className="grid gap-1.5">
            <span className="font-mono text-[11px] tracking-[0.08em] text-nova-muted uppercase">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            <FieldControl field={field} />
          </label>
        ))}
        {error ? (
          <p role="alert" className="text-sm text-orange-300">
            {error}
          </p>
        ) : null}
        {flash ? (
          <p role="status" className="text-sm text-nova-green">
            {flash}
          </p>
        ) : null}
        <button
          type="submit"
          className="inline-flex h-10 w-fit items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/80"
        >
          Save {spec.entityName}
        </button>
      </form>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {spec.features.search ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${spec.entityPlural.toLowerCase()}…`}
              className="h-10 max-w-sm rounded-lg border border-nova-border-lit bg-nova-bg2 px-3 text-sm text-nova-text outline-none"
            />
          ) : null}
          {spec.features.exportCsv ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-nova-border-lit px-4 text-sm disabled:opacity-50"
              onClick={exportCsv}
              disabled={!visible.length}
            >
              Export CSV
            </button>
          ) : null}
          <span className="font-mono text-[11px] text-nova-dim">
            {rows.length} {spec.entityPlural.toLowerCase()}
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-nova-border px-4 py-8 text-sm text-nova-muted">
            No {spec.entityPlural.toLowerCase()} yet. Add the first one to populate this list.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-nova-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-nova-bg2 text-[11px] tracking-[0.08em] text-nova-dim uppercase">
                <tr>
                  {spec.fields.map((field) => (
                    <th key={field.name} className="px-3 py-2 font-medium">
                      {field.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Created</th>
                  {spec.features.delete ? <th className="px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-t border-nova-border">
                    {spec.fields.map((field) => (
                      <td key={field.name} className="px-3 py-2 text-nova-text">
                        {row[field.name] || "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 font-mono text-xs text-nova-dim">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    {spec.features.delete ? (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs text-nova-muted hover:text-nova-text"
                          onClick={() => removeRow(row.id)}
                        >
                          Remove
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
