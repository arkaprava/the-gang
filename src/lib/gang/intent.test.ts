import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeIntent, runTitle } from "./intent";

test("analyzeIntent derives an entity name and email field from a waitlist brief", () => {
  const intent = analyzeIntent("Add a waitlist with email and csv export");
  assert.equal(intent.entityName, "Waitlist");
  assert.ok(intent.fields.some((f) => f.name === "email" && f.type === "email" && f.required));
  assert.equal(intent.capabilities.exportCsv, true);
});

test("analyzeIntent always produces at least one required field", () => {
  const intent = analyzeIntent("Track something for the team");
  assert.ok(intent.fields.some((f) => f.required));
});

test("analyzeIntent picks up status options and marks status capability", () => {
  const intent = analyzeIntent("Kanban board for tickets with status");
  const status = intent.fields.find((f) => f.name === "status");
  assert.ok(status);
  assert.deepEqual(status?.options, ["Backlog", "In progress", "Review", "Done"]);
  assert.equal(intent.capabilities.status, true);
});

test("analyzeIntent defaults to 'teammate' when no actor keyword is present", () => {
  assert.equal(analyzeIntent("Track inventory counts").actor, "teammate");
});

test("runTitle uses the first sentence when it's short enough", () => {
  assert.equal(runTitle("Add a waitlist. It should collect email."), "Add a waitlist");
});
