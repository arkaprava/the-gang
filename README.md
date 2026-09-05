# The Gang

The Gang is a **terminal agent** — Product Owner, Business Analyst, Developer, and QA — that turns a feature brief into a plan, architecture, production TypeScript, and a QA report.

It runs in your actual shell, the same way Cursor’s agent or Claude Code does. There is no browser UI.

Shared context lives in **Postgres with pgvector**. Every role reads it. You can list it, search it, and write into it.

## Run

```bash
cp .env.example .env.local
# set DATABASE_URL to a Postgres instance with the vector extension
npm install
npm start
```

That drops you into a prompt:

```
the gang
po · ba · dev · qa  ·  shared context on pgvector
gang>
```

Without `DATABASE_URL`, the gang falls back to `.data/gang.json`.

If this environment used a temporary Neon database, claim it within 72 hours using `PUBLIC_POSTGRES_CLAIM_URL` in `.env.local`.

## Commands

| Command | What it does |
| --- | --- |
| `run <feature>` | Brief the gang |
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
- `gang_context` — shared memory + embeddings
