import assert from "node:assert/strict";
import { test } from "node:test";
import { firstSentence, pluralize, titleCase, toKebab, tokenize, toPascal } from "./text";

test("tokenize lowercases, strips punctuation, and drops stopwords", () => {
  assert.deepEqual(tokenize("Add a Waitlist with Email!"), ["waitlist", "email"]);
});

test("tokenize drops single-character tokens", () => {
  assert.deepEqual(tokenize("a b cd"), ["cd"]);
});

test("toPascal joins and capitalizes words", () => {
  assert.equal(toPascal(["waitlist", "signup"]), "WaitlistSignup");
});

test("toPascal always emits a valid JS/TS identifier (regression: hyphenated/digit-leading briefs)", () => {
  // tokenize() only strips punctuation other than "-", so a brief like
  // "sign-up flow" reaches toPascal() as the single token "sign-up" —
  // that produced `export type Sign-upFlow = ...`, a syntax error.
  assert.equal(toPascal(["sign-up", "flow"]), "SignUpFlow");
  // A brief starting with a number ("365 waitlist") produced a type name
  // starting with a digit, also a syntax error.
  assert.equal(toPascal(["365", "waitlist"]), "Item365Waitlist");
  assert.match(toPascal(["365", "waitlist"]), /^[A-Za-z][A-Za-z0-9]*$/);
  assert.match(toPascal([]), /^[A-Za-z][A-Za-z0-9]*$/);
});

test("toKebab splits camelCase into hyphenated lowercase", () => {
  assert.equal(toKebab("WaitlistSignup"), "waitlist-signup");
});

test("pluralize handles consonant-y, s/x/ch endings, and the regular case", () => {
  assert.equal(pluralize("Company"), "Companies");
  assert.equal(pluralize("Status"), "Statuses");
  assert.equal(pluralize("Box"), "Boxes");
  assert.equal(pluralize("Task"), "Tasks");
});

test("titleCase capitalizes the first letter of each word", () => {
  assert.equal(titleCase("new waitlist"), "New Waitlist");
});

test("firstSentence stops at the first sentence-ending punctuation", () => {
  assert.equal(firstSentence("Add a waitlist. It should collect email."), "Add a waitlist.");
});

test("firstSentence returns the whole trimmed text when it has no terminal punctuation", () => {
  const long = "word ".repeat(40).trim();
  assert.equal(firstSentence(long), long);
});

test("firstSentence falls back to a truncated slice only for empty/degenerate input", () => {
  assert.equal(firstSentence("..."), "...".slice(0, 140));
});
