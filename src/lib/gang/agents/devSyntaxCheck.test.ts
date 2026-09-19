import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTsSyntax } from "./devSyntaxCheck";
import type { GeneratedFile } from "../types";

test("valid .ts and .tsx content produces no diagnostics", () => {
  const files: GeneratedFile[] = [
    {
      path: "src/types/widget.ts",
      language: "ts",
      content: `export type Widget = {\n  id: string;\n};\n`,
    },
    {
      path: "src/components/widget-board.tsx",
      language: "tsx",
      content: `export function WidgetBoard() {\n  return <div>hi</div>;\n}\n`,
    },
  ];
  assert.deepEqual(checkTsSyntax(files), []);
});

test("a hyphenated exported type name is flagged (the repo's own regression case)", () => {
  const files: GeneratedFile[] = [
    {
      path: "src/types/sign-up-flow.ts",
      language: "ts",
      content: `export type Sign-upFlow = {\n  id: string;\n};\n`,
    },
  ];
  const diagnostics = checkTsSyntax(files);
  assert.ok(diagnostics.length > 0);
  assert.match(diagnostics[0], /sign-up-flow\.ts/);
});

test("unbalanced braces are flagged", () => {
  const files: GeneratedFile[] = [
    { path: "src/types/widget.ts", language: "ts", content: `export type Widget = {\n  id: string;\n` },
  ];
  assert.ok(checkTsSyntax(files).length > 0);
});

test("non-ts/tsx files (e.g. the generated README) are skipped entirely", () => {
  const files: GeneratedFile[] = [{ path: "docs/widget.md", language: "md", content: "# not even close to TS {{{" }];
  assert.deepEqual(checkTsSyntax(files), []);
});

test("valid JSX does not produce a false-positive '--jsx flag' diagnostic", () => {
  const files: GeneratedFile[] = [
    {
      path: "src/components/widget-board.tsx",
      language: "tsx",
      content: `export function WidgetBoard() {\n  return (\n    <section>\n      <p>hello</p>\n    </section>\n  );\n}\n`,
    },
  ];
  assert.deepEqual(checkTsSyntax(files), []);
});
