import assert from "node:assert/strict";
import { test } from "node:test";
import { runBusinessAnalyst } from "./ba";
import { produceDevOutput, runDeveloper } from "./dev";
import { analyzeIntent } from "../intent";
import type { LlmClient } from "../llm/types";

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

function fakeClient(complete: LlmClient["complete"]): LlmClient {
  return { provider: "claude", model: "test-model", complete };
}

test("produceDevOutput: no client configured falls back to the deterministic generator", async () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const ba = runBusinessAnalyst(intent, []);
  const result = await produceDevOutput(null, intent, ba);
  assert.equal(result.source, "template");
  assert.deepEqual(result.output, runDeveloper(intent, ba));
});

test("produceDevOutput: a valid LLM response matching the expected file set is used as-is", async () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const ba = runBusinessAnalyst(intent, []);
  const expectedPaths = runDeveloper(intent, ba).files.map((f) => f.path);
  const client = fakeClient(async () =>
    JSON.stringify({
      files: expectedPaths.map((path) => ({
        path,
        language: path.endsWith(".tsx") ? "tsx" : path.endsWith(".md") ? "md" : "ts",
        content: path.endsWith(".md") ? "# ok" : "export const ok = true;\n",
      })),
    })
  );
  const result = await produceDevOutput(client, intent, ba);
  assert.equal(result.source, "llm");
  assert.deepEqual(result.output.files.map((f) => f.path).sort(), expectedPaths.slice().sort());
});

test("produceDevOutput: a response with the wrong file count falls back to the deterministic generator", async () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const ba = runBusinessAnalyst(intent, []);
  const client = fakeClient(async () =>
    JSON.stringify({ files: [{ path: "src/not-the-right-file.ts", language: "ts", content: "export const x = 1;" }] })
  );
  const result = await produceDevOutput(client, intent, ba);
  assert.equal(result.source, "template");
  assert.match(result.note ?? "", /files has 1 entries, expected/);
});

test("produceDevOutput: a response with a right-sized but wrong-named file set falls back to the deterministic generator", async () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const ba = runBusinessAnalyst(intent, []);
  const expectedPaths = runDeveloper(intent, ba).files.map((f) => f.path);
  const client = fakeClient(async () =>
    JSON.stringify({
      // right count, but the first path is renamed so it's not in the expected set
      files: expectedPaths.map((path, i) => ({
        path: i === 0 ? "src/not-the-right-file.ts" : path,
        language: path.endsWith(".tsx") ? "tsx" : path.endsWith(".md") ? "md" : "ts",
        content: path.endsWith(".md") ? "# ok" : "export const ok = true;\n",
      })),
    })
  );
  const result = await produceDevOutput(client, intent, ba);
  assert.equal(result.source, "template");
  assert.match(result.note ?? "", /not one of the expected/);
});

test("produceDevOutput: syntactically broken generated code falls back to the deterministic generator (the exact bug class fixed previously)", async () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const ba = runBusinessAnalyst(intent, []);
  const expectedPaths = runDeveloper(intent, ba).files.map((f) => f.path);
  const typesPath = expectedPaths.find((p) => p.includes("types/") && !p.endsWith(".test.ts"))!;
  const client = fakeClient(async () =>
    JSON.stringify({
      files: expectedPaths.map((path) => ({
        path,
        language: path.endsWith(".tsx") ? "tsx" : path.endsWith(".md") ? "md" : "ts",
        content: path === typesPath ? "export type Sign-upFlow = { id: string };" : path.endsWith(".md") ? "# ok" : "export const ok = true;\n",
      })),
    })
  );
  const result = await produceDevOutput(client, intent, ba);
  assert.equal(result.source, "template");
  assert.match(result.note ?? "", /syntax check/);
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
