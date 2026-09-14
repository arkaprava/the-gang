# The Gang

The Gang is a **terminal agent** — Product Owner, Business Analyst, Developer, and QA — that turns a feature brief into a plan, architecture, production TypeScript, and a QA report.

It runs in your actual shell, the same way Cursor’s agent or Claude Code does. There is no browser UI.

Shared context lives in **local Postgres with pgvector**. Every role reads it. You can list it, search it, and write into it. Similarity is a lexical hashed bag-of-words, not a semantic embedding model — `context search` finds shared vocabulary, not paraphrases.

Every stage is deterministic template logic, not an LLM call — PO, BA, and QA run instantly and for free; DEV generates Next.js/React source meant to be copied into a real app, not run here.

## Run

```bash
cp .env.example .env.local
docker compose up -d
npm install
npm start
```

That drops you into a prompt:

```
the gang
po · ba · dev · qa  ·  shared context on pgvector
gang>
```

`DATABASE_URL` defaults to the local Docker pgvector instance (`postgres://gang:gang@localhost:5434/gang`). Without it, the gang falls back to `.data/gang.json`.

## Commands

| Command | What it does |
| --- | --- |
| `run <feature>` | Brief the gang (always runs the Code Review skill after QA) |
| `approve` / `reject` | Human-in-the-loop gates after PO and DEV |
| `jobs` / `open <id>` | List and inspect jobs |
| `plan` `arch` `code` `qa` `log` | Artifacts |
| `write` | Dump generated files into `./shipped/<slug>` |
| `context` | Show shared pgvector memory |
| `context search <q>` | Nearest-neighbor search |
| `context add <note>` | Write a note the next run can retrieve |
| `help` | Command list |
| `exit` | Quit |

You can also pass a command as arguments and stay in the session if you’re on a TTY:

```bash
npm start -- run "waitlist with email validation and csv export"
```

Approving the plan writes generated files under `shipped/`.

## Schema

See `sql/schema.sql`. Tables:

- `gang_runs` — job payloads
- `gang_context` — shared memory + embeddings, HNSW-indexed on `embedding`

## Tests

```bash
npm test        # node's test runner over the pure agent/intent/text logic
npm run typecheck
```
