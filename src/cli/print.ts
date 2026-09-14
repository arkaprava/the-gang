import type { Run } from "../lib/gang/types";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export const color = c;

export function shortId(id: string) {
  return id.slice(0, 8);
}

export function print(line = "") {
  process.stdout.write(`${line}\n`);
}

export function printRole(role: string, message: string) {
  const painted =
    role === "PO"
      ? c.cyan(role.padEnd(6))
      : role === "DEV"
        ? c.green(role.padEnd(6))
        : role === "QA"
          ? c.yellow(role.padEnd(6))
          : role === "BA"
            ? c.cyan(role.padEnd(6))
            : c.dim(role.padEnd(6));
  print(`${painted} ${message}`);
}

export function printBanner(contextCount: number, jobCount: number) {
  print(c.bold(c.green("the gang")));
  print(c.dim("po · ba · dev · qa  ·  shared context on pgvector"));
  print(c.dim(`${contextCount} vectors  ·  ${jobCount} jobs`));
  print(c.dim("type help, or: run <feature>"));
  print();
}

export function formatRun(run: Run) {
  const lines = [
    `${c.bold(run.title)}  ${c.dim(shortId(run.id))}`,
    `${c.dim("status")}  ${run.status}  ${c.dim("stage")}  ${run.currentStage}`,
    `${c.dim("brief")}   ${run.description}`,
  ];
  if (run.retrievedMemory.length) {
    lines.push(c.dim("context hits"));
    for (const hit of run.retrievedMemory) {
      lines.push(`  ${c.green(`${Math.round(hit.score * 100)}%`.padStart(4))}  ${hit.role.padEnd(4)}  ${hit.text}`);
    }
  }
  if (run.decision) {
    lines.push(c.yellow(`gate  ${run.decision.prompt}`));
    lines.push(c.dim("type  approve  or  reject"));
  }
  return lines.join("\n");
}

export function formatPlan(run: Run) {
  if (!run.po) return "no plan yet.";
  const po = run.po;
  const lines = [c.bold(po.epic), po.summary, ""];
  for (const story of po.stories) {
    lines.push(c.cyan(`${story.id}  ${story.title}`));
    lines.push(`  as a ${story.asA}, I want ${story.iWant} so that ${story.soThat}.`);
    for (const item of story.acceptance) lines.push(c.dim(`  - ${item}`));
  }
  lines.push("", c.dim("in scope"));
  for (const item of po.scope) lines.push(`  ${item}`);
  return lines.join("\n");
}

export function formatArch(run: Run) {
  if (!run.ba) return "architecture unlocks after you approve the plan.";
  const ba = run.ba;
  const lines = [ba.dataModelNotes, ""];
  for (const item of ba.stack) lines.push(`${c.bold(item.name)}  ${c.dim(item.reason)}`);
  lines.push("");
  for (const api of ba.apis) lines.push(`${c.cyan(api.method.padEnd(6))} ${api.path}  ${c.dim(api.purpose)}`);
  return lines.join("\n");
}

export function formatCode(run: Run, fileQuery = "") {
  if (!run.dev) return "code unlocks after plan approval.";
  const files = run.dev.files;
  const match =
    (fileQuery ? files.find((file) => file.path.includes(fileQuery)) : undefined) ?? files[0];
  return [`files`, ...files.map((file) => `  ${file.path}`), "", c.bold(match.path), match.content].join("\n");
}

export function formatQa(run: Run) {
  if (!run.qa) return "qa runs after you approve the code.";
  const qa = run.qa;
  const lines = [`${c.green(`${qa.coverage}%`)}  ${qa.summary}`];
  for (const test of qa.tests) {
    lines.push(`${test.passed ? c.green("PASS") : c.red("FAIL")}  ${test.name}  ${c.dim(test.detail)}`);
  }
  return lines.join("\n");
}

export const HELP = `commands
  run <feature>              brief the gang (PO → BA → DEV → QA)
  approve / reject           pass or stop the current gate
  jobs                       list jobs
  open <n|id>                inspect a job
  plan / arch / code / qa / log
  write                      dump generated files into ./shipped/<slug>
  context                    shared pgvector memory
  context search <query>     nearest-neighbor search
  context add <note>         write a note the next run can retrieve
  clear                      clear the screen
  exit                       quit
`;
