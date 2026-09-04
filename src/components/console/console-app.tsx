"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { decidePipelineAction, startPipelineAction } from "@/app/actions";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogoMark } from "@/components/logo-mark";
import { FeaturePreview } from "@/components/console/feature-preview";
import {
  DEFAULT_MODELS,
  estimateRunCost,
  LLM_CATALOG,
  SKILL_CATALOG,
} from "@/lib/nova/catalog";
import type { LlmId, Run } from "@/lib/nova/types";
import { cn } from "@/lib/utils";

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
    recent: {
      id: string;
      role: string;
      text: string;
      createdAt: string;
      tags: string[];
      runId: string;
    }[];
  };
};

const EXAMPLES = [
  "Waitlist signup with name, work email validation, and CSV export",
  "Bug tracker with title, severity, status, notes, and search",
  "Office inventory log with item name, quantity, category, and due date",
];

const STAGES = [
  { key: "PO", label: "PO Planning", role: "Product Owner", tone: "text-nova-purple border-nova-purple-mid bg-nova-purple-dim" },
  { key: "BA", label: "Tech / BA", role: "Business Analyst", tone: "text-nova-cyan border-nova-cyan/40 bg-nova-cyan-dim" },
  { key: "DEV", label: "Development", role: "Developer", tone: "text-nova-green border-nova-green/40 bg-nova-green-dim" },
  { key: "QA", label: "QA & Testing", role: "QA Engineer", tone: "text-nova-orange border-nova-orange/40 bg-nova-orange-dim" },
] as const;

function stageStatus(run: Run | null, key: (typeof STAGES)[number]["key"]) {
  if (!run) return "queued";
  const order = ["PO", "BA", "DEV", "QA", "SKILLS", "DONE"];
  const current = order.indexOf(run.currentStage);
  const idx = order.indexOf(key);
  if (run.status === "rejected" && idx >= current && run.currentStage !== "DONE") {
    if (idx === current && run.decision) return "awaiting";
    if (idx >= current) return "queued";
  }
  if (idx < current) return "passed";
  if (idx === current) {
    if (run.status === "awaiting_decision") return "awaiting";
    if (run.status === "running") return "running";
    if (run.status === "complete") return "passed";
    if (run.status === "rejected") return "rejected";
  }
  return "queued";
}

function RunSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
    >
      {pending ? "Running squad…" : "Run Nova pipeline"}
    </button>
  );
}

function DecideSubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ConsoleApp({
  initialWorkspace,
  initialRun = null,
}: {
  initialWorkspace: Workspace;
  initialRun?: Run | null;
}) {
  const workspace = initialWorkspace;
  const run = initialRun;
  const [description, setDescription] = useState(initialRun?.description ?? EXAMPLES[0]);
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [skills, setSkills] = useState<string[]>(initialRun?.skills ?? ["code-review"]);
  const [filePath, setFilePath] = useState<string | null>(initialRun?.dev?.files[0]?.path ?? null);
  const [artifactTab, setArtifactTab] = useState("preview");

  const cost = useMemo(() => estimateRunCost(models, skills.length), [models, skills.length]);
  const activeFile = run?.dev?.files.find((file) => file.path === filePath) ?? run?.dev?.files[0];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-nova-border bg-[rgba(13,15,26,0.9)] px-4 py-3 backdrop-blur-lg md:px-6">
        <div className="flex items-center gap-3">
          <LogoMark size={32} id="headerLogo" />
          <div>
            <div className="text-base font-bold tracking-tight">Nova</div>
            <div className="font-mono text-[10px] tracking-[0.12em] text-nova-muted uppercase">
              Product Delivery Accelerator
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-6 text-xs text-nova-muted md:flex">
          <span>{workspace?.memory.total ?? 0} memory entries</span>
          <span>{workspace?.memory.coverage ?? 0}% embedding coverage</span>
          <span>{workspace?.runs.length ?? 0} features</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-5 p-4 md:p-6 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <aside className="flex flex-col gap-4">
          <form
            className="rounded-2xl border border-nova-border bg-nova-bg1 p-4"
            action={startPipelineAction}
          >
            <div className="mb-3 font-mono text-[11px] tracking-[0.12em] text-nova-purple uppercase">
              Describe what to ship
            </div>
            <Textarea
              name="description"
              required
              minLength={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-28 rounded-xl border-nova-border-lit bg-nova-bg2 text-sm dark:bg-nova-bg2"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setDescription(example)}
                  className="rounded-full border border-nova-border px-2.5 py-1 text-[11px] text-nova-muted hover:border-nova-border-lit hover:text-nova-text"
                >
                  {example.split(" ").slice(0, 3).join(" ")}…
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-2">
              <div className="font-mono text-[11px] tracking-[0.12em] text-nova-dim uppercase">BYO LLM per role</div>
              {(["PO", "BA", "DEV", "QA"] as const).map((role) => (
                <label key={role} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-nova-muted">{role}</span>
                  <select
                    name={`model-${role}`}
                    value={models[role]}
                    onChange={(e) =>
                      setModels((current) => ({ ...current, [role]: e.target.value as LlmId }))
                    }
                    className="h-8 rounded-md border border-nova-border-lit bg-nova-bg2 px-2 text-xs"
                  >
                    {Object.values(LLM_CATALOG).map((llm) => (
                      <option key={llm.id} value={llm.id}>
                        {llm.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="mt-4 grid gap-2">
              <div className="font-mono text-[11px] tracking-[0.12em] text-nova-dim uppercase">
                Skills after QA
              </div>
              {SKILL_CATALOG.map((skill) => {
                const checked = skills.includes(skill.id);
                return (
                  <label key={skill.id} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="skills"
                      value={skill.id}
                      className="mt-0.5"
                      checked={checked}
                      onChange={() =>
                        setSkills((current) =>
                          checked ? current.filter((id) => id !== skill.id) : [...current, skill.id]
                        )
                      }
                    />
                    <span>
                      <span className="block font-medium text-nova-text">{skill.name}</span>
                      <span className="text-nova-dim">{skill.desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-nova-border bg-nova-bg2/60 p-3 text-xs">
              <div className="flex justify-between text-nova-muted">
                <span>Est. tokens</span>
                <span className="font-mono text-nova-cyan">{cost.tokens.toLocaleString()}</span>
              </div>
              <div className="mt-1 flex justify-between text-nova-muted">
                <span>Est. API cost</span>
                <span className="font-mono text-nova-green">
                  {cost.estimatedUsd === 0 ? "$0.00 (local)" : `$${cost.estimatedUsd.toFixed(4)}`}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-nova-dim">{cost.notes}</p>
            </div>

            <RunSubmitButton />
          </form>

          <section className="rounded-2xl border border-nova-border bg-nova-bg1 p-4">
            <div className="mb-3 font-mono text-[11px] tracking-[0.12em] text-nova-purple uppercase">
              Shipped features
            </div>
            <div className="grid gap-2">
              {(workspace?.runs ?? []).length === 0 ? (
                <p className="text-sm text-nova-dim">No features yet. The first run seeds company memory.</p>
              ) : (
                workspace?.runs.map((item) => (
                  <Link
                    key={item.id}
                    href={`/?run=${item.id}`}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-sm transition",
                      run?.id === item.id
                        ? "border-nova-purple-mid bg-nova-purple-dim"
                        : "border-nova-border hover:border-nova-border-lit"
                    )}
                  >
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 font-mono text-[10px] text-nova-dim uppercase">
                      {item.status} · {item.currentStage}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="rounded-2xl border border-nova-border bg-nova-bg1 p-4 md:p-5">
            <div className="font-mono text-[11px] tracking-[0.12em] text-nova-purple uppercase">
              The Nova pipeline
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
              {run ? run.title : "Think it. Ship it."}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-nova-muted">
              {run
                ? run.description
                : "Every request flows through Product Owner → Business Analyst → Developer → QA, with you approving the plan and the generated code."}
            </p>
            <div className="nova-pipeline-line relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {STAGES.map((stage) => {
                const status = stageStatus(run, stage.key);
                return (
                  <div key={stage.key} className="relative z-1 flex flex-col items-center text-center">
                    <div
                      className={cn(
                        "mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border font-mono text-sm font-bold",
                        stage.tone,
                        status === "running" && "animate-pulse",
                        status === "queued" && "opacity-50"
                      )}
                    >
                      {stage.key}
                    </div>
                    <div className="text-sm font-semibold">{stage.label}</div>
                    <div className="font-mono text-[10px] tracking-[0.1em] text-nova-dim uppercase">
                      {stage.role}
                    </div>
                    <div
                      className={cn(
                        "mt-1 font-mono text-[11px]",
                        status === "passed" && "text-nova-green",
                        status === "running" && "text-nova-cyan",
                        status === "awaiting" && "text-nova-orange",
                        status === "queued" && "text-nova-dim"
                      )}
                    >
                      {status === "passed"
                        ? "Passed ✓"
                        : status === "running"
                          ? "Running…"
                          : status === "awaiting"
                            ? "Awaiting you"
                            : "Queued"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {run?.decision ? (
            <div className="rounded-2xl border border-nova-purple-mid bg-nova-purple-dim p-4 md:p-5">
              <div className="font-mono text-[11px] tracking-[0.12em] text-nova-purple uppercase">
                Human-in-the-loop
              </div>
              <p className="mt-1 text-sm text-nova-text">{run.decision.prompt}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={decidePipelineAction}>
                  <input type="hidden" name="runId" value={run.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <DecideSubmitButton
                    label="Approve and continue"
                    pendingLabel="Continuing…"
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
                  />
                </form>
                <form action={decidePipelineAction}>
                  <input type="hidden" name="runId" value={run.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <DecideSubmitButton
                    label="Reject"
                    pendingLabel="Stopping…"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-nova-border-lit px-4 text-sm font-medium text-nova-muted hover:text-nova-text disabled:opacity-50"
                  />
                </form>
              </div>
            </div>
          ) : null}

          <div className="min-h-[420px] rounded-2xl border border-nova-border bg-nova-bg1 p-4 md:p-5">
            {!run ? (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                <div className="mb-3 font-mono text-[11px] tracking-[0.12em] text-nova-purple uppercase">
                  Empty squad
                </div>
                <p className="max-w-md text-sm text-nova-muted">
                  Describe a feature and run the pipeline. Nova writes stories, picks a stack, generates
                  production TypeScript, then QA-tests it — using persistent memory from earlier runs.
                </p>
              </div>
            ) : (
              <Tabs
                key={run.id}
                value={artifactTab}
                onValueChange={(value) => setArtifactTab(String(value))}
                className="gap-4"
              >
                <TabsList variant="line" className="flex w-full flex-wrap justify-start gap-1">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="plan">Plan</TabsTrigger>
                  <TabsTrigger value="arch">Architecture</TabsTrigger>
                  <TabsTrigger value="code">Code</TabsTrigger>
                  <TabsTrigger value="qa">QA</TabsTrigger>
                  <TabsTrigger value="log">Log</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" keepMounted>
                  {run.dev ? (
                    <FeaturePreview spec={run.dev.preview} />
                  ) : (
                    <p className="text-sm text-nova-muted">
                      Preview unlocks after the Developer agent ships files. Approve the PO plan to continue.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="plan">
                  {run.po ? (
                    <div className="grid gap-4">
                      <div>
                        <h2 className="text-lg font-bold">{run.po.epic}</h2>
                        <p className="mt-1 text-sm text-nova-muted">{run.po.summary}</p>
                      </div>
                      {run.po.stories.map((story) => (
                        <article key={story.id} className="rounded-xl border border-nova-border bg-nova-bg2/40 p-4">
                          <div className="font-mono text-[11px] text-nova-dim">{story.id}</div>
                          <h3 className="font-semibold">{story.title}</h3>
                          <p className="mt-1 text-sm text-nova-muted">
                            As a {story.asA}, I want {story.iWant} so that {story.soThat}.
                          </p>
                          <ul className="mt-2 grid gap-1 text-sm text-nova-text">
                            {story.acceptance.map((item) => (
                              <li key={item}>✓ {item}</li>
                            ))}
                          </ul>
                        </article>
                      ))}
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <div className="text-sm font-semibold">In scope</div>
                          <ul className="mt-1 text-sm text-nova-muted">
                            {run.po.scope.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-sm font-semibold">Risks</div>
                          <ul className="mt-1 text-sm text-nova-muted">
                            {run.po.risks.map((risk) => (
                              <li key={risk.title}>
                                <span className="text-nova-orange">{risk.severity}</span> — {risk.title}.{" "}
                                {risk.mitigation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-nova-muted">Product Owner is still writing.</p>
                  )}
                </TabsContent>
                <TabsContent value="arch">
                  {run.ba ? (
                    <div className="grid gap-4">
                      <div className="grid gap-2 md:grid-cols-3">
                        {run.ba.stack.map((item) => (
                          <div key={item.name} className="rounded-xl border border-nova-border p-3">
                            <div className="font-semibold">{item.name}</div>
                            <p className="mt-1 text-xs text-nova-muted">{item.reason}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-nova-muted">{run.ba.dataModelNotes}</p>
                      <table className="w-full text-left text-sm">
                        <thead className="text-nova-dim">
                          <tr>
                            <th className="py-2">Method</th>
                            <th>Path</th>
                            <th>Purpose</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.ba.apis.map((api) => (
                            <tr key={api.path + api.method} className="border-t border-nova-border">
                              <td className="py-2 font-mono text-nova-cyan">{api.method}</td>
                              <td className="font-mono text-xs">{api.path}</td>
                              <td className="text-nova-muted">{api.purpose}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-nova-muted">Architecture appears after you approve the plan.</p>
                  )}
                </TabsContent>
                <TabsContent value="code">
                  {run.dev ? (
                    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="grid h-fit gap-1">
                        {run.dev.files.map((file) => (
                          <button
                            key={file.path}
                            type="button"
                            onClick={() => setFilePath(file.path)}
                            className={cn(
                              "rounded-lg px-2 py-1.5 text-left font-mono text-[11px]",
                              activeFile?.path === file.path
                                ? "bg-nova-purple-dim text-nova-text"
                                : "text-nova-muted hover:text-nova-text"
                            )}
                          >
                            {file.path}
                          </button>
                        ))}
                      </div>
                      <pre className="max-h-[520px] overflow-auto rounded-xl border border-nova-border bg-[#0a0c16] p-4 text-[12px] leading-5 text-nova-text">
                        <code>{activeFile?.content}</code>
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm text-nova-muted">Code is generated after plan approval.</p>
                  )}
                </TabsContent>
                <TabsContent value="qa">
                  {run.qa ? (
                    <div className="grid gap-4">
                      <div className="flex flex-wrap gap-4">
                        <div>
                          <div className="font-mono text-2xl text-nova-green">{run.qa.coverage}%</div>
                          <div className="text-xs text-nova-dim">Coverage</div>
                        </div>
                        <p className="max-w-xl text-sm text-nova-muted">{run.qa.summary}</p>
                      </div>
                      <div className="grid gap-2">
                        {run.qa.tests.map((test) => (
                          <div
                            key={test.name}
                            className="flex items-start justify-between gap-3 rounded-xl border border-nova-border px-3 py-2 text-sm"
                          >
                            <div>
                              <div className="font-medium">{test.name}</div>
                              <div className="text-xs text-nova-dim">
                                {test.type} · {test.detail}
                              </div>
                            </div>
                            <span className={test.passed ? "text-nova-green" : "text-orange-300"}>
                              {test.passed ? "PASS" : "FAIL"}
                            </span>
                          </div>
                        ))}
                      </div>
                      {run.skillResults?.map((skill) => (
                        <div key={skill.id} className="rounded-xl border border-nova-border p-3">
                          <div className="font-semibold">{skill.name}</div>
                          <ul className="mt-2 grid gap-1 text-sm text-nova-muted">
                            {skill.findings.map((finding) => (
                              <li key={finding.title}>
                                <span className="text-nova-cyan">{finding.severity}</span> — {finding.title}:{" "}
                                {finding.detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-nova-muted">QA runs after you approve the generated code.</p>
                  )}
                </TabsContent>
                <TabsContent value="log">
                  <div className="grid max-h-[520px] gap-2 overflow-auto">
                    {run.events.map((item, index) => (
                      <div key={`${item.at}-${index}`} className="flex gap-3 font-mono text-[12px]">
                        <span className="shrink-0 text-nova-dim">
                          {new Date(item.at).toLocaleTimeString()}
                        </span>
                        <span className="w-14 shrink-0 text-nova-purple">{item.role}</span>
                        <span className="text-nova-muted">{item.message}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-2xl border border-nova-border bg-nova-bg1 p-4">
            <div className="font-mono text-[11px] tracking-[0.12em] text-nova-purple uppercase">
              Nova Intelligence
            </div>
            <h2 className="mt-1 text-lg font-bold">Memory that compounds</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-nova-border bg-nova-bg2 p-3">
                <div className="font-mono text-lg text-nova-purple">{workspace?.memory.total ?? 0}</div>
                <div className="text-[11px] text-nova-dim">Entries</div>
              </div>
              <div className="rounded-xl border border-nova-border bg-nova-bg2 p-3">
                <div className="font-mono text-lg text-nova-green">{workspace?.memory.coverage ?? 0}%</div>
                <div className="text-[11px] text-nova-dim">Coverage</div>
              </div>
              <div className="rounded-xl border border-nova-border bg-nova-bg2 p-3">
                <div className="font-mono text-lg text-nova-cyan">{workspace?.runs.length ?? 0}</div>
                <div className="text-[11px] text-nova-dim">Squads</div>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {(["PO", "DEV", "BA", "QA"] as const).map((role) => {
                const count = workspace?.memory.byRole[role] ?? 0;
                const max = Math.max(4, ...(Object.values(workspace?.memory.byRole ?? { PO: 1 }) as number[]));
                return (
                  <div key={role}>
                    <div className="mb-1 flex justify-between font-mono text-[11px] text-nova-muted">
                      <span>{role}</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-nova-bg3">
                      <div
                        className="h-full rounded-full bg-nova-purple"
                        style={{ width: `${Math.min(100, (count / max) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid gap-2">
              {(workspace?.memory.recent ?? []).slice(0, 6).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-nova-border p-2.5 text-xs text-nova-muted">
                  <div className="mb-1 font-mono text-[10px] text-nova-dim">
                    {entry.role} · {entry.tags.join(", ")}
                  </div>
                  {entry.text}
                </div>
              ))}
            </div>
          </section>

          {run?.retrievedMemory.length ? (
            <section className="rounded-2xl border border-nova-border bg-nova-bg1 p-4">
              <div className="font-mono text-[11px] tracking-[0.12em] text-nova-cyan uppercase">
                Retrieved for this run
              </div>
              <div className="mt-2 grid gap-2">
                {run.retrievedMemory.map((hit) => (
                  <div key={hit.id} className="text-xs text-nova-muted">
                    <span className="font-mono text-nova-cyan">{hit.role}</span>{" "}
                    <span className="text-nova-dim">{Math.round(hit.score * 100)}%</span> — {hit.text}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
