# The Gang

The Gang is a **terminal agent** — Product Owner, Business Analyst, Developer, and QA — that turns a feature brief into a plan, architecture, production TypeScript, and a QA report.

It runs in your actual shell, the same way Cursor’s agent or Claude Code does. There is no browser UI.

Shared context lives in **local Postgres with pgvector**. Every role reads it. You can list it, search it, and write into it. Similarity is a lexical hashed bag-of-words, not a semantic embedding model — `context search` finds shared vocabulary, not paraphrases.

Every stage runs a deterministic template by default — instant, free, no config needed. Point it at Claude, GPT, or DeepSeek (any API key, see [LLM providers](#llm-providers)) and PO/BA/DEV/QA use that model instead, falling back to the template for any stage where the call fails or no key is set. DEV generates Next.js/React source meant to be copied into a real app, not run here.

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
| `models` | Show configured LLM provider/model, which API keys are set, and per-stage source for the open job |
| `help` | Command list |
| `exit` | Quit |

You can also pass a command as arguments and stay in the session if you’re on a TTY:

```bash
npm start -- run "waitlist with email validation and csv export"
```

Approving the plan writes generated files under `shipped/`.

## LLM providers

Optional — with nothing configured, every stage uses its deterministic
template. Set a provider, a model, and the matching key in `.env.local`
(see `.env.example`):

```bash
GANG_LLM_PROVIDER=claude   # claude | openai | deepseek
GANG_LLM_MODEL=claude-sonnet-5
ANTHROPIC_API_KEY=sk-ant-...
```

Only Claude needs `ANTHROPIC_API_KEY`; `openai`/`deepseek` need
`OPENAI_API_KEY`/`DEEPSEEK_API_KEY` respectively (both speak the same
OpenAI-compatible chat-completions API). There's no default model id —
check the provider's current model list and set one explicitly. Run
`models` to see what's active and whether keys are detected.

If a call fails for any reason (no key, network error, the response
doesn't parse, or — for DEV specifically — the generated code fails a
TypeScript syntax check) that stage silently falls back to its template
and the run still completes; `models` shows which stages actually used the
LLM for a given job.

## Schema

See `sql/schema.sql`. Tables:

- `gang_runs` — job payloads
- `gang_context` — shared memory + embeddings, HNSW-indexed on `embedding`

## Tests

```bash
npm test        # node's test runner over the pure agent/intent/text logic
npm run typecheck
```
