# Nova — Product Delivery Accelerator

Nova deploys an AI squad — Product Owner, Business Analyst, Developer, and QA Engineer — that turns a feature description into a plan, architecture, production TypeScript, a clickable preview, and a QA report.

This repo is a working slice of that pipeline, including human-in-the-loop gates and a persistent memory layer.

## What it does

1. **You describe a feature** (for example: waitlist with email validation and CSV export).
2. **Product Owner** writes an epic, user stories, acceptance criteria, risks, and scope. This stage is deterministic and does not call an LLM.
3. **You approve the plan.**
4. **Business Analyst** chooses a stack, data model, and API contracts.
5. **Developer** generates production files (types, store, REST handlers, UI, tests, docs) and a live preview of the feature.
6. **You approve the code.**
7. **QA** runs unit, integration, regression, and accessibility checks against the generated surface.
8. Optional **skills** (Code Review, Documentation, Security Audit) run after QA.
9. **Nova Intelligence** stores every stage as a vector embedding. Later runs retrieve related memory so conventions compound.

Bring-your-own LLM assignment (Claude / Mistral / Qwen) is per role. PO and QA stay deterministic. BA and DEV use the selected profile; this slice runs them locally so you can use the product without API keys. Cost estimates still show Claude pricing when you assign it.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43141](http://localhost:43141).

## Try it

1. Keep the default prompt or paste your own feature.
2. Optionally change models per role and attach post-QA skills.
3. Click **Run Nova pipeline**.
4. Read the plan, then **Approve and continue**.
5. Use the **Preview** tab like a shipped feature (create, search, export).
6. Inspect generated code, then approve it for QA.

Workspace state is stored in `.data/nova.json` (gitignored).
