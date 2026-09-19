import ts from "typescript";
import type { GeneratedFile } from "../types";

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.Preserve, // required or every valid .tsx file gets a false-positive "no --jsx flag" diagnostic
};

// Syntax-only validation for LLM-generated files, deliberately NOT full
// type-checking: the generated code imports `next/server` and `@/...`
// aliases that don't exist in this repo's own environment, so a real
// `ts.createProgram` with module resolution would always fail on files this
// repo never installs Next.js for. `transpileModule` never does module
// resolution — it can only catch syntax errors, which is exactly the bug
// class this guards against (e.g. `export type Sign-upFlow = {` from a
// hyphenated brief, fixed in a prior session). Returns an empty array when
// the file set is clean.
export function checkTsSyntax(files: GeneratedFile[]): string[] {
  const diagnostics: string[] = [];

  for (const file of files) {
    if (file.language !== "ts" && file.language !== "tsx") continue;

    // `fileName`'s extension controls how `transpileModule` infers
    // `scriptKind` — it does not read a separate parameter for this, so a
    // wrong extension silently mis-parses JSX as broken TS (or vice versa).
    const fileName = file.path.endsWith(".tsx") || file.language === "tsx" ? "generated.tsx" : "generated.ts";

    const result = ts.transpileModule(file.content, {
      fileName,
      reportDiagnostics: true,
      compilerOptions: COMPILER_OPTIONS,
    });

    for (const diagnostic of result.diagnostics ?? []) {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
      const at =
        diagnostic.file && diagnostic.start !== undefined
          ? (() => {
              const { line, character } = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!);
              return `${line + 1}:${character + 1}`;
            })()
          : "?";
      diagnostics.push(`${file.path}:${at} — ${message}`);
    }
  }

  return diagnostics;
}
