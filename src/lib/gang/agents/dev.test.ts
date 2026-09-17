import assert from "node:assert/strict";
import { test } from "node:test";
import { runBusinessAnalyst } from "./ba";
import { runDeveloper } from "./dev";
import { analyzeIntent } from "../intent";

test("email validator rejects malformed addresses (regression: unescaped \\s/\\. in the generated regex)", () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const ba = runBusinessAnalyst(intent, []);
  const dev = runDeveloper(intent, ba);
  const typesFile = dev.files.find((f) => f.path.endsWith(`types/${intent.slug}.ts`));
  assert.ok(typesFile, "expected a generated domain-type file");

  const match = typesFile!.content.match(/!\/(.+?)\/\.test/);
  assert.ok(match, "expected an email regex in the generated validator");
  const emailRegex = new RegExp(match![1]);

  assert.ok(emailRegex.test("alex@company.com"));
  // A bare `\s` collapses to `s` in a template literal unless the backslash
  // itself is escaped — that bug let any address without the letter "s"
  // through, spaces included.
  assert.ok(!emailRegex.test("al ex@company.com"));
  // Likewise `\.` must stay a literal dot, not an unescaped wildcard.
  assert.ok(!emailRegex.test("alex@companyXcom"));
});

test("search only matches text-ish fields, never id/createdAt", () => {
  const intent = analyzeIntent("Add a ticket with a title, notes, priority, and a due date");
  const ba = runBusinessAnalyst(intent, []);
  const dev = runDeveloper(intent, ba);
  const storeFile = dev.files.find((f) => f.path.endsWith(`${intent.slug}-store.ts`));
  assert.ok(storeFile, "expected a generated store file");

  const match = storeFile!.content.match(/SEARCHABLE_FIELDS = \[(.*)\] as const/);
  assert.ok(match, "expected a SEARCHABLE_FIELDS literal in the generated store");
  const searchable = match![1]
    .split(",")
    .map((s) => s.trim().replace(/"/g, ""))
    .filter(Boolean);

  assert.ok(searchable.length > 0);
  assert.ok(!searchable.includes("id"));
  assert.ok(!searchable.includes("createdAt"));
  // The generated store must no longer stringify the whole record to search it.
  assert.ok(!storeFile!.content.includes("JSON.stringify(row)"));
});

test("generated type/component names are valid identifiers for hyphenated and digit-leading briefs (regression)", () => {
  for (const brief of ["Add a sign-up flow with email", "Track 365 waitlist signups"]) {
    const intent = analyzeIntent(brief);
    const ba = runBusinessAnalyst(intent, []);
    const dev = runDeveloper(intent, ba);
    // `export type ${entityName} = ...` and `export function ${entityName}Board`
    // are spliced straight into generated source — a hyphen or leading digit
    // there used to produce a TypeScript syntax error.
    assert.match(intent.entityName, /^[A-Za-z][A-Za-z0-9]*$/, `bad entity name for "${brief}": ${intent.entityName}`);
    const typesFile = dev.files.find((f) => f.path.endsWith(`types/${intent.slug}.ts`))!;
    assert.ok(typesFile.content.includes(`export type ${intent.entityName} = {`));
  }
});

test("the generated README carries the Business Analyst's stack and data model, not just the PO/DEV output", () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const ba = runBusinessAnalyst(intent, []);
  const dev = runDeveloper(intent, ba);
  const readme = dev.files.find((f) => f.path.endsWith(".md"));
  assert.ok(readme, "expected a generated README");

  for (const item of ba.stack) assert.ok(readme!.content.includes(item.name));
  assert.ok(readme!.content.includes(ba.dataModelNotes));
});
