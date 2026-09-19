import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJson } from "./jsonExtract";

test("extractJson parses plain JSON", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test("extractJson strips a ```json fence", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
});

test("extractJson strips a bare ``` fence", () => {
  assert.deepEqual(extractJson('```\n{"a":1}\n```'), { a: 1 });
});

test("extractJson throws on non-JSON text", () => {
  assert.throws(() => extractJson("sorry, I can't help with that"));
});
