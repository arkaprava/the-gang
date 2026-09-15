#!/usr/bin/env node
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadEnv } from "./env";
import { closeDatabase } from "../lib/gang/db";
import { createRun, decideRun, listWorkspace } from "../lib/gang/pipeline";
import { activeBackend, addUserContext, getRun, querySharedContext } from "../lib/gang/store";
import type { Run } from "../lib/gang/types";
import {
  HELP,
  color,
  formatArch,
  formatCode,
  formatPlan,
  formatQa,
  formatRun,
  print,
  printBanner,
  printRole,
  shortId,
} from "./print.js";
import { writeShipped } from "./ship.js";

loadEnv();

const PROMPT = color.green("gang") + color.dim("> ");

type Workspace = Awaited<ReturnType<typeof listWorkspace>>;

class Session {
  run: Run | null = null;
  workspace: Workspace | null = null;
  rl: readline.Interface | null;
  stopped = false;

  constructor(rl: readline.Interface | null) {
    this.rl = rl;
    this.rl?.on("close", () => {
      this.stopped = true;
    });
  }

  async boot() {
    this.workspace = await listWorkspace();
    printBanner(this.workspace.memory.total, this.workspace.runs.length);
  }

  async refresh(selected?: Run | null) {
    this.workspace = await listWorkspace();
    if (selected) this.run = selected;
  }

  async handle(raw: string) {
    const inputLine = raw.trim();
    if (!inputLine) return;
    const [verb, ...rest] = inputLine.split(/\s+/);
    const arg = rest.join(" ").trim();

    switch (verb.toLowerCase()) {
      case "help":
      case "?":
        print(HELP);
        break;
      case "clear":
        process.stdout.write("\x1b[2J\x1b[H");
        break;
      case "exit":
      case "quit":
        this.stopped = true;
        this.rl?.close();
        break;
      case "who":
        print("the gang");
        print("  PO   product owner     stories and gates");
        print("  BA   business analyst  stack, data, APIs");
        print("  DEV  developer         files written to ./shipped");
        print("  QA   qa engineer       checks and coverage");
        print(color.dim("shared context is one pgvector table every role reads and writes."));
        break;
      case "jobs":
      case "ls":
        this.listJobs();
        break;
      case "run":
        await this.start(arg);
        break;
      case "open":
        await this.open(arg);
        break;
      case "approve":
      case "reject":
        await this.decide(verb.toLowerCase() as "approve" | "reject");
        break;
      case "plan":
        print(this.run ? formatPlan(this.run) : "no job attached. run <feature> first.");
        break;
      case "arch":
      case "architecture":
        print(this.run ? formatArch(this.run) : "no job attached.");
        break;
      case "code":
        print(this.run ? formatCode(this.run, arg) : "no job attached.");
        break;
      case "qa":
        print(this.run ? formatQa(this.run) : "no job attached.");
        break;
      case "log":
        if (!this.run) print("no job attached.");
        else for (const item of this.run.events) printRole(item.role, item.message);
        break;
      case "write":
        await this.writeFiles();
        break;
      case "context":
        await this.context(arg);
        break;
      default:
        print(color.red(`unknown command '${verb}'. try help.`));
    }
  }

  listJobs() {
    const runs = this.workspace?.runs ?? [];
    if (!runs.length) {
      print("no jobs yet. run <feature> to brief the gang.");
      return;
    }
    for (const [index, item] of runs.entries()) {
      const marker = this.run?.id === item.id ? color.green("*") : " ";
      print(
        `${marker} ${String(index + 1).padStart(2)}  ${shortId(item.id)}  ${item.status.padEnd(18)}  ${item.currentStage.padEnd(6)}  ${item.title}`
      );
    }
  }

  pick(arg: string) {
    const runs = this.workspace?.runs ?? [];
    if (!arg) return runs[0];
    const asNumber = Number(arg);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= runs.length) {
      return runs[asNumber - 1];
    }
    return runs.find(
      (item) =>
        item.id === arg ||
        item.id.startsWith(arg) ||
        item.title.toLowerCase().includes(arg.toLowerCase())
    );
  }

  async start(description: string) {
    if (description.length < 8) {
      print(color.red("need a longer brief. example: run waitlist with email and csv export"));
      return;
    }
    printRole("SYSTEM", "dispatching PO → BA → DEV → QA …");
    const run = await createRun({ description, skills: ["code-review"] });
    this.run = run;
    for (const hit of run.retrievedMemory) {
      printRole("MEM", `${Math.round(hit.score * 100)}% ${hit.role}  ${hit.text}`);
    }
    print();
    print(formatPlan(run));
    print();
    print(formatRun(run));
    await this.refresh(run);
  }

  async open(arg: string) {
    const picked = this.pick(arg);
    if (!picked) {
      print(color.red("unknown job. jobs lists ids."));
      return;
    }
    const run = await getRun(picked.id);
    if (!run) {
      print(color.red("job missing from store."));
      return;
    }
    this.run = run;
    print(formatRun(run));
  }

  async decide(action: "approve" | "reject") {
    if (!this.run) {
      print(color.red("no job attached. open <id> first."));
      return;
    }
    const next = await decideRun(this.run.id, action);
    this.run = next;
    if (action === "reject") {
      printRole("SYSTEM", "rejected. pipeline stopped.");
      await this.refresh(next);
      return;
    }
    if (next.ba) {
      print();
      printRole("BA", next.ba.dataModelNotes);
    }
    if (next.dev) {
      printRole("DEV", `generated ${next.dev.files.length} files for ${next.dev.preview.entityName}`);
      const written = await writeShipped(next);
      for (const file of written) print(color.dim(`  wrote ${file}`));
    }
    if (next.qa) {
      print(formatQa(next));
    }
    if (next.skillResults?.length) {
      for (const skill of next.skillResults) {
        printRole("SKILL", `${skill.name}: ${skill.findings.map((f) => f.title).join("; ")}`);
      }
    }
    print();
    print(formatRun(next));
    await this.refresh(next);
  }

  async writeFiles() {
    if (!this.run?.dev) {
      print(color.red("no generated files yet. approve the plan first."));
      return;
    }
    const written = await writeShipped(this.run);
    for (const file of written) print(`wrote ${file}`);
  }

  async context(arg: string) {
    if (!arg) {
      this.workspace = await listWorkspace();
      const entries = this.workspace.memory.recent;
      print(color.dim(`shared context  ${this.workspace.memory.total} vectors`));
      if (!entries.length) {
        print("empty. context add <note> writes one.");
        return;
      }
      for (const entry of entries) {
        print(
          `${color.yellow((entry.source ?? "agent").padEnd(6))} ${entry.role.padEnd(5)}  ${entry.text}`
        );
      }
      return;
    }
    if (arg === "search" || arg.startsWith("search ")) {
      const query = arg.slice("search".length).trim();
      if (!query) {
        print(color.red("usage: context search <query>"));
        return;
      }
      const hits = await querySharedContext(query, 12);
      if (!hits.length) {
        print("no nearby vectors.");
        return;
      }
      for (const hit of hits) {
        print(
          `${color.green(`${Math.round(hit.score * 100)}%`.padStart(4))}  ${(hit.source ?? "agent").padEnd(6)} ${hit.role.padEnd(5)}  ${hit.text}`
        );
      }
      return;
    }
    if (arg.startsWith("add ")) {
      const text = arg.slice(4).trim();
      const entry = await addUserContext(text);
      const backend = await activeBackend();
      const where = backend === "postgres" ? "pgvector" : "the local file store (.data/gang.json)";
      print(`stored in ${where}  ${shortId(entry.id)}`);
      await this.refresh(this.run);
      return;
    }
    print(color.red("usage: context | context search <q> | context add <note>"));
  }
}

async function runPiped(session: Session, initial?: string) {
  if (initial) {
    await session.handle(initial);
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || session.stopped) continue;
    try {
      await session.handle(line);
    } catch (error) {
      print(color.red(error instanceof Error ? error.message : "command failed"));
    }
  }
}

async function runTty(session: Session, initial?: string) {
  const rl = session.rl;
  if (!rl) return;
  if (initial) await session.handle(initial);

  rl.setPrompt(PROMPT);
  rl.on("SIGINT", () => {
    print();
    session.stopped = true;
    rl.close();
  });
  rl.prompt();

  try {
    for await (const line of rl) {
      if (session.stopped) break;
      try {
        await session.handle(line);
      } catch (error) {
        print(color.red(error instanceof Error ? error.message : "command failed"));
      }
      if (session.stopped) break;
      rl.prompt();
    }
  } catch {
    /* EOF */
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const initial = argv.length ? argv.join(" ") : undefined;

  if (!input.isTTY) {
    const session = new Session(null);
    await session.boot();
    await runPiped(session, initial);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: true });
  const session = new Session(rl);
  await session.boot();
  await runTty(session, initial);
  rl.close();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
