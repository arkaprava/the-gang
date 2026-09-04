"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DataField, PreviewSpec } from "@/lib/nova/types";

type RecordRow = Record<string, string> & { id: string; createdAt: string };

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

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: DataField;
  value: string;
  onChange: (value: string) => void;
}) {
  const className =
    "h-10 rounded-lg border-nova-border-lit bg-nova-bg2 text-sm text-nova-text dark:bg-nova-bg2";
  if (field.type === "text") {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-20 rounded-lg border-nova-border-lit bg-nova-bg2 dark:bg-nova-bg2"
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} w-full px-3`}
      >
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
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        />
        Enabled
      </label>
    );
  }
  return (
    <Input
      type={field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}

export function FeaturePreview({ spec }: { spec: PreviewSpec }) {
  const blank = useMemo(
    () => Object.fromEntries(spec.fields.map((field) => [field.name, field.type === "boolean" ? "false" : ""])),
    [spec.fields]
  );
  const [draft, setDraft] = useState<Record<string, string>>(blank);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visible = rows.filter((row) => {
    if (!query.trim()) return true;
    return JSON.stringify(row).toLowerCase().includes(query.toLowerCase());
  });

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate(spec.fields, draft);
    if (errors.length) {
      setError(errors.join(". "));
      return;
    }
    setError(null);
    setRows((current) => [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...draft,
      },
      ...current,
    ]);
    setDraft(blank);
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
      <form onSubmit={onCreate} className="grid gap-3 rounded-xl border border-nova-border bg-nova-bg2/50 p-4">
        <div className="text-sm font-semibold">New {spec.entityName}</div>
        {spec.fields.map((field) => (
          <label key={field.name} className="grid gap-1.5">
            <span className="font-mono text-[11px] tracking-[0.08em] text-nova-muted uppercase">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            <FieldControl
              field={field}
              value={draft[field.name] ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, [field.name]: value }))}
            />
          </label>
        ))}
        {error ? (
          <p role="alert" className="text-sm text-orange-300">
            {error}
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
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${spec.entityPlural.toLowerCase()}…`}
              className="h-10 max-w-sm rounded-lg border-nova-border-lit bg-nova-bg2 dark:bg-nova-bg2"
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
                          onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
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
