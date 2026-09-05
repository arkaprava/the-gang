# The Gang

The Gang is a terminal for an AI squad — Product Owner, Business Analyst, Developer, and QA — that turns a feature brief into a plan, architecture, production TypeScript, a live preview, and a QA report.

Shared context lives in **Postgres with pgvector**. Every role reads it. You can browse it, search it, and write into it.

## Run locally

```bash
cp .env.example .env.local
# set DATABASE_URL to a Postgres instance with the vector extension
npm install
npm run dev
```

Open [http://localhost:43141](http://localhost:43141).

Without `DATABASE_URL`, the gang falls back to a local JSON file. With Postgres, context is stored as `vector(48)` embeddings and retrieved with cosine distance.

If this environment used a temporary Neon database, claim it within 72 hours using the `PUBLIC_POSTGRES_CLAIM_URL` printed into `.env.local`.

## Terminal commands

| Command | What it does |
| --- | --- |
| `run <feature>` | Brief the gang |
| `approve` / `reject` | Human-in-the-loop gates after PO and DEV |
| `jobs` / `open <id>` | List and inspect jobs |
| `plan` `arch` `code` `qa` `log` | Artifacts |
| `preview` | Clickable preview of the generated feature |
| `context` | Show shared pgvector memory |
| `context search <q>` | Nearest-neighbor search |
| `context add <note>` | Write a note the next run can retrieve |
| `help` | Command list |

## Schema

See `sql/schema.sql`. Tables:

- `gang_runs` — job payloads
- `gang_context` — shared memory + embeddings
