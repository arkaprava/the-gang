# The Gang — agent notes

This is a terminal CLI, not a web app. There is no Next.js runtime here — `next`
is not a dependency (check `package.json`) — the only things generated
*content* happens to target Next.js/React conventions (see below), and that's
a property of the output, not of this project's own stack.

## What this actually is

- Entry point: [`src/cli/index.ts`](src/cli/index.ts) — a `node:readline`
  REPL (`tsx src/cli/index.ts`, wired up as `npm start`).
- Pipeline: [`src/lib/gang/pipeline.ts`](src/lib/gang/pipeline.ts) runs a
  fixed PO → BA → DEV → QA sequence with a human approval gate after PO and
  after DEV. Each stage's *deterministic, template-based function* in
  `src/lib/gang/agents/*.ts` (`runProductOwner`, `runBusinessAnalyst`,
  `runDeveloper`, `runQa`) is still there, unchanged, and is what actually
  runs by default — `intent.ts`'s keyword-driven field/entity detection is
  never LLM-backed. Each agent also exports an async `produce<Stage>Output`
  wrapper that optionally calls a configured LLM (see "Optional LLM
  backing" below) and falls back to the deterministic function on any
  failure — the deterministic function is the load-bearing fallback
  contract now, not just "the whole implementation." Don't assume
  `run <feature>` used an LLM; check `Run.stageSource` or the `models`
  command.
- Shared "memory": [`src/lib/gang/memory.ts`](src/lib/gang/memory.ts) embeds
  text as a 48-bucket hashed bag-of-words vector, stored in Postgres/pgvector
  (schema in [`sql/schema.sql`](sql/schema.sql)) or, if `DATABASE_URL` isn't
  set/reachable, a local `.data/gang.json` file
  ([`src/lib/gang/store.ts`](src/lib/gang/store.ts)). This is lexical
  similarity, not a semantic embedding model — don't describe `context
  search` as "semantic search" in docs or UI copy.
- Generated code lands under `shipped/<slug>/` and targets Next.js Route
  Handlers + React, because that's the stack the DEV agent hardcodes in
  [`src/lib/gang/agents/dev.ts`](src/lib/gang/agents/dev.ts) — it is meant to
  be copied into a real Next.js app, not run in this repo.

## Before changing agent output

The four agents in `src/lib/gang/agents/` hand-build source files as
template strings. When editing them:
- Anything with a regex or backslash inside a template literal needs the
  backslash doubled (`\\s`, not `\s`) or it silently degrades — an untagged
  template literal drops unrecognized single-backslash escapes instead of
  erroring. This bit `dev.ts`'s email validator once; there's a regression
  test in [`src/lib/gang/agents/dev.test.ts`](src/lib/gang/agents/dev.test.ts).
- Run `npm test` and `npm run typecheck` after touching `intent.ts`,
  `text.ts`, or `agents/*.ts` — they're pure functions and cheap to cover.

## Store/backend

`getStore()` in `store.ts` decides Postgres vs. local file **once per
process** and caches the hydrated store in memory; mutations go through
`mutateRun` / `createRunRecord` / `addMemoryEntry`, which persist just the
changed row. Don't reintroduce a "read everything, diff it, write
everything" pattern per command — that was the previous, much slower design.

## Optional LLM backing

[`src/lib/gang/llm/`](src/lib/gang/llm/) is a small provider abstraction
(`getLlmClient()` in `client.ts`) that, like the store backend above,
decides its config **once per process** and caches it: `GANG_LLM_PROVIDER`
+ `GANG_LLM_MODEL` + the matching `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` / `DEEPSEEK_API_KEY` (see `.env.example`). Unset or
incomplete → `getLlmClient()` returns `null` and every stage runs its
deterministic template, same as before this existed.

Each `produce<Stage>Output(client, ...)` calls the shared
`generateWithFallback()` (`llm/withFallback.ts`): on ANY failure — no
client, network error, invalid JSON, a response that fails validation — it
falls back to the deterministic function for that stage and the run still
completes. `Run.stageSource` records, per stage, whether it came from
`"llm"` or `"template"`; the `models` CLI command shows it.

Two things to preserve if you touch this:
- **DEV never accepts LLM output without running it through
  `checkTsSyntax()`** (`agents/devSyntaxCheck.ts`, syntax-only — no module
  resolution, since generated code imports `next/server`/`@/...` that don't
  exist in this repo). A successful API call is not sufficient; this is
  what catches an LLM emitting invalid TypeScript (the exact bug class in
  the `toPascal()` fix above) before it's written to `shipped/`.
- **QA's `tests`/`coverage`/`issues` never come from the LLM** — `runQa()`
  always runs first in `produceQaOutput`, and the LLM only supplies
  `summary`/`advisoryNotes` prose on top of it. Known, disclosed gap:
  `runQa`'s checks are string-pattern matches calibrated to the
  deterministic DEV template's exact code idioms, so LLM-generated code
  that's correct but differently-styled can still show up as false QA
  failures — not fixed yet, see the PR that introduced this section.
