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
  after DEV. Each stage is a **deterministic, template-based function** in
  `src/lib/gang/agents/*.ts` — there is no LLM call anywhere in this repo.
  Don't assume `run <feature>` does anything smarter than string templating
  driven by keyword matching in [`src/lib/gang/intent.ts`](src/lib/gang/intent.ts).
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
