"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FeaturePreview } from "@/components/console/feature-preview";
import type { Run } from "@/lib/nova/types";

type MemoryCard = {
  id: string;
  role: string;
  text: string;
  createdAt: string;
  tags: string[];
  runId: string;
  source?: string;
};

type Workspace = {
  runs: {
    id: string;
    title: string;
    description: string;
    createdAt: string;
    status: Run["status"];
    currentStage: Run["currentStage"];
    skills: string[];
  }[];
  memory: {
    total: number;
    coverage: number;
    byRole: Record<string, number>;
    recent: MemoryCard[];
  };
};

type Line = { kind: "in" | "out" | "sys" | "err"; text: string };

const HELP = `commands
  help                         this list
  run <feature>                send work to the gang
  jobs                         list jobs
  open <n|id>                  inspect a job
  approve                      pass the current gate
  reject                       stop the current job
  plan | arch | code | qa | log
  preview                      live UI for the current job
  context                      shared pgvector memory
  context search <query>       cosine search
  context add <note>           write into shared context
  clear                        wipe the scrollback
  who                          roster`;

function shortId(id: string) {
  return id.slice(0, 8);
}

export function TerminalApp({
  initialWorkspace,
  initialRun = null,
}: {
  initialWorkspace: Workspace;
  initialRun?: Run | null;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [run, setRun] = useState<Run | null>(initialRun);
  const [lines, setLines] = useState<Line[]>([]);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(Boolean(initialRun?.dev));
  const [booted, setBooted] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = "gang@squad:~$";

  useEffect(() => {
    setBooted(true);
    const jobs = initialWorkspace.runs.length;
    const mem = initialWorkspace.memory.total;
    setLines([
      { kind: "sys", text: "THE GANG  ·  product delivery squad" },
      { kind: "sys", text: "roles     po · ba · dev · qa" },
      { kind: "sys", text: `context   ${mem} vectors in shared pgvector store` },
      { kind: "sys", text: `jobs      ${jobs} on record` },
      { kind: "out", text: initialRun ? `attached job ${shortId(initialRun.id)}  ${initialRun.title}` : "type `help` or `run <feature>` to clock in." },
    ]);
  }, [initialWorkspace, initialRun]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines, showPreview]);

  const contextEntries = workspace.memory.recent;

  async function refreshWorkspace(selected?: Run | null) {
    const res = await fetch("/api/workspace", { cache: "no-store" });
    const data = (await res.json()) as Workspace;
    setWorkspace(data);
    if (selected) setRun(selected);
  }

  function write(kind: Line["kind"], text: string) {
    setLines((current) => [...current, { kind, text }]);
  }

  function printBlock(text: string, kind: Line["kind"] = "out") {
    const chunks = text.split("\n");
    setLines((current) => [...current, ...chunks.map((line) => ({ kind, text: line || " " }))]);
  }

  async function handle(raw: string) {
    const input = raw.trim();
    if (!input) return;
    write("in", `${prompt} ${input}`);
    const [verb, ...rest] = input.split(/\s+/);
    const arg = rest.join(" ").trim();

    try {
      setBusy(true);
      switch (verb.toLowerCase()) {
        case "help":
        case "?":
          printBlock(HELP);
          break;
        case "clear":
          setLines([]);
          break;
        case "who":
          printBlock(
            [
              "the gang",
              "  PO   product owner     plans stories and gates",
              "  BA   business analyst  stack, data, APIs",
              "  DEV  developer         files + live preview",
              "  QA   qa engineer       checks and coverage",
              "shared context is one pgvector table every role reads and writes.",
            ].join("\n")
          );
          break;
        case "jobs":
        case "ls": {
          if (!workspace.runs.length) {
            write("out", "no jobs yet. run <feature> to brief the gang.");
            break;
          }
          printBlock(
            workspace.runs
              .map(
                (item, index) =>
                  `${String(index + 1).padStart(2, " ")}  ${shortId(item.id)}  ${item.status.padEnd(18)}  ${item.currentStage.padEnd(6)}  ${item.title}`
              )
              .join("\n")
          );
          break;
        }
        case "run": {
          if (arg.length < 8) {
            write("err", "need a longer brief. example: run waitlist with email and csv export");
            break;
          }
          write("sys", "dispatching PO → BA → DEV → QA …");
          const res = await fetch("/api/runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: arg, skills: ["code-review"] }),
          });
          const json = await res.json();
          if (!res.ok) {
            write("err", json.error ?? "run failed");
            break;
          }
          const next = json.run as Run;
          setRun(next);
          setShowPreview(Boolean(next.dev));
          window.history.replaceState(null, "", `/?run=${next.id}`);
          printBlock(formatRun(next));
          await refreshWorkspace(next);
          break;
        }
        case "open": {
          const picked = pickRun(workspace.runs, arg) ?? (arg && run?.id.startsWith(arg) ? run : null);
          if (!picked) {
            write("err", "unknown job. jobs lists ids.");
            break;
          }
          const res = await fetch(`/api/runs/${picked.id}`, { cache: "no-store" });
          const json = await res.json();
          const next = (json.run ?? json) as Run;
          setRun(next);
          setShowPreview(Boolean(next.dev));
          window.history.replaceState(null, "", `/?run=${next.id}`);
          printBlock(formatRun(next));
          break;
        }
        case "approve":
        case "reject":
          await decide(verb.toLowerCase() as "approve" | "reject");
          break;
        case "plan":
          printBlock(run?.po ? formatPlan(run) : "no plan yet. run a job first.");
          break;
        case "arch":
        case "architecture":
          printBlock(run?.ba ? formatArch(run) : "architecture unlocks after you approve the plan.");
          break;
        case "code":
          printBlock(run?.dev ? formatCode(run, arg) : "code unlocks after plan approval.");
          break;
        case "qa":
          printBlock(run?.qa ? formatQa(run) : "qa runs after you approve the code.");
          break;
        case "log":
          printBlock(run ? run.events.map((item) => `${item.role.padEnd(6)} ${item.message}`).join("\n") : "no job attached.");
          break;
        case "preview":
          if (!run?.dev) {
            write("err", "preview unlocks after the developer ships.");
            break;
          }
          setShowPreview(true);
          write("out", `preview pane open for ${run.dev.preview.entityName}.`);
          break;
        case "context":
          await handleContext(arg);
          break;
        default:
          write("err", `unknown command '${verb}'. try help.`);
      }
    } catch (error) {
      write("err", error instanceof Error ? error.message : "command failed");
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "approve" | "reject") {
    if (!run) {
      write("err", "no job attached. open <id> first.");
      return;
    }
    const res = await fetch(`/api/runs/${run.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!res.ok) {
      write("err", json.error ?? "decision failed");
      return;
    }
    const next = json.run as Run;
    setRun(next);
    setShowPreview(Boolean(next.dev));
    printBlock(formatRun(next));
    await refreshWorkspace(next);
  }

  async function handleContext(arg: string) {
    if (!arg) {
      const res = await fetch("/api/context", { cache: "no-store" });
      const json = await res.json();
      const entries = (json.entries ?? []) as MemoryCard[];
      setWorkspace((current) => ({
        ...current,
        memory: { ...current.memory, recent: entries, total: json.total ?? entries.length },
      }));
      if (!entries.length) {
        write("out", "shared context is empty.");
        return;
      }
      printBlock(
        [`shared context  ${json.total} vectors`, ...entries.map(formatContextLine)].join("\n")
      );
      return;
    }
    if (arg.startsWith("search ")) {
      const query = arg.slice(7).trim();
      const res = await fetch(`/api/context?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const json = await res.json();
      const hits = (json.hits ?? []) as { role: string; text: string; score: number; source?: string }[];
      if (!hits.length) {
        write("out", "no nearby vectors.");
        return;
      }
      printBlock(
        hits
          .map(
            (hit) =>
              `${Math.round(hit.score * 100).toString().padStart(3, " ")}%  ${(hit.source ?? "agent").padEnd(6)}  ${hit.role.padEnd(5)}  ${hit.text}`
          )
          .join("\n")
      );
      return;
    }
    if (arg.startsWith("add ")) {
      const text = arg.slice(4).trim();
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) {
        write("err", json.error ?? "could not write context");
        return;
      }
      write("out", `stored in pgvector  ${shortId(json.entry.id)}`);
      await refreshWorkspace(run);
      return;
    }
    write("err", "usage: context | context search <q> | context add <note>");
  }

  const status = useMemo(() => {
    if (!run) return "idle";
    if (run.decision) return `gate:${run.decision.stage.toLowerCase()}`;
    return `${run.status}:${run.currentStage.toLowerCase()}`;
  }, [run]);

  return (
    <div
      className="gang-crt flex min-h-full flex-col bg-[#050805] text-[#7CFF9A] md:flex-row"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col md:min-h-full">
        <header className="flex items-center justify-between border-b border-[#1f5c2c] px-3 py-2 font-mono text-[11px] tracking-[0.14em] uppercase md:px-4">
          <span>the gang</span>
          <span className="text-[#4aa85c]">{status}</span>
          <span className="hidden sm:inline">{workspace.memory.total} ctx</span>
        </header>

        <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-3 py-3 font-mono text-[13px] leading-6 md:px-4">
          {lines.map((line, index) => (
            <pre
              key={`${index}-${line.text.slice(0, 24)}`}
              className={
                line.kind === "in"
                  ? "whitespace-pre-wrap text-[#d6ff62]"
                  : line.kind === "err"
                    ? "whitespace-pre-wrap text-[#ffb4a2]"
                    : line.kind === "sys"
                      ? "whitespace-pre-wrap text-[#4aa85c]"
                      : "whitespace-pre-wrap text-[#7CFF9A]"
              }
            >
              {line.text}
            </pre>
          ))}
          {run?.decision ? (
            <pre className="mt-2 whitespace-pre-wrap text-[#d6ff62]">
              {`gate  ${run.decision.prompt}\ntype  approve  or  reject`}
            </pre>
          ) : null}
        </div>

        <form
          method="dialog"
          className="flex items-center gap-2 border-t border-[#1f5c2c] px-3 py-2 font-mono text-[13px] md:px-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const value = command;
            setCommand("");
            void handle(value);
          }}
        >
          <label className="text-[#d6ff62]">{prompt}</label>
          <input
            ref={inputRef}
            value={command}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setCommand(event.target.value)}
            className="h-8 min-w-0 flex-1 bg-transparent text-[#7CFF9A] outline-none placeholder:text-[#2f6b3c]"
            placeholder={booted ? (busy ? "working…" : "help") : ""}
          />
        </form>

        {showPreview && run?.dev ? (
          <div className="max-h-[42vh] overflow-auto border-t border-[#1f5c2c] bg-[#071108] p-3 md:p-4">
            <div className="mb-2 font-mono text-[11px] tracking-[0.14em] text-[#4aa85c] uppercase">
              preview · {run.dev.preview.entityName}
            </div>
            <FeaturePreview spec={run.dev.preview} />
          </div>
        ) : null}
      </div>

      <aside className="flex max-h-[40vh] w-full flex-col border-t border-[#1f5c2c] bg-[#061007] md:max-h-none md:w-[340px] md:border-t-0 md:border-l">
        <div className="border-b border-[#1f5c2c] px-3 py-2 font-mono text-[11px] tracking-[0.14em] text-[#4aa85c] uppercase">
          shared context · pgvector
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 font-mono text-[12px] leading-5">
          {contextEntries.length === 0 ? (
            <p className="text-[#4aa85c]">no vectors yet. context add &lt;note&gt; writes one.</p>
          ) : (
            <ul className="grid gap-3">
              {contextEntries.map((entry) => (
                <li key={entry.id} className="border-l-2 border-[#1f5c2c] pl-2">
                  <div className="text-[#d6ff62]">
                    {(entry.source ?? "agent").toUpperCase()} · {entry.role}
                    {entry.tags.length ? ` · ${entry.tags.join(",")}` : ""}
                  </div>
                  <p className="mt-1 text-[#7CFF9A]">{entry.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="border-t border-[#1f5c2c] px-3 py-2 font-mono text-[10px] leading-4 text-[#2f6b3c]">
          everyone in the gang reads this store. your notes retrieve on the next run.
        </p>
      </aside>
    </div>
  );
}

function pickRun(runs: Workspace["runs"], arg: string) {
  if (!arg) return runs[0];
  const asNumber = Number(arg);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= runs.length) {
    return runs[asNumber - 1];
  }
  return runs.find((item) => item.id === arg || item.id.startsWith(arg) || item.title.toLowerCase().includes(arg.toLowerCase()));
}

function formatRun(run: Run) {
  const lines = [
    `job     ${shortId(run.id)}  ${run.title}`,
    `status  ${run.status}  stage ${run.currentStage}`,
    `brief   ${run.description}`,
  ];
  if (run.retrievedMemory.length) {
    lines.push("context hits");
    for (const hit of run.retrievedMemory) {
      lines.push(`  ${Math.round(hit.score * 100)}%  ${hit.role}  ${hit.text}`);
    }
  }
  if (run.decision) lines.push(`gate    ${run.decision.prompt}`);
  if (run.po) lines.push(`plan    ${run.po.stories.length} stories · type plan`);
  if (run.dev) lines.push(`code    ${run.dev.files.length} files · type preview`);
  if (run.qa) lines.push(`qa      ${run.qa.coverage}% · type qa`);
  return lines.join("\n");
}

function formatPlan(run: Run) {
  const po = run.po!;
  return [
    po.epic,
    po.summary,
    "",
    ...po.stories.flatMap((story) => [
      `${story.id}  ${story.title}`,
      `  as a ${story.asA}, I want ${story.iWant} so that ${story.soThat}.`,
      ...story.acceptance.map((item) => `  - ${item}`),
    ]),
  ].join("\n");
}

function formatArch(run: Run) {
  const ba = run.ba!;
  return [
    ba.dataModelNotes,
    "",
    ...ba.stack.map((item) => `${item.name}: ${item.reason}`),
    "",
    ...ba.apis.map((api) => `${api.method.padEnd(6)} ${api.path}  ${api.purpose}`),
  ].join("\n");
}

function formatCode(run: Run, fileQuery: string) {
  const files = run.dev!.files;
  const match = fileQuery
    ? files.find((file) => file.path.includes(fileQuery)) ?? files[0]
    : files[0];
  return [`files`, ...files.map((file) => `  ${file.path}`), "", match.path, match.content].join("\n");
}

function formatQa(run: Run) {
  const qa = run.qa!;
  return [
    `${qa.coverage}%  ${qa.summary}`,
    ...qa.tests.map((test) => `${test.passed ? "PASS" : "FAIL"}  ${test.name}  ${test.detail}`),
  ].join("\n");
}

function formatContextLine(entry: MemoryCard) {
  return `${(entry.source ?? "agent").padEnd(6)}  ${entry.role.padEnd(5)}  ${entry.text}`;
}
