import { runBusinessAnalyst } from "./agents/ba";
import { runDeveloper } from "./agents/dev";
import { runProductOwner } from "./agents/po";
import { runQa } from "./agents/qa";
import { runSkills } from "./agents/skills";
import { estimateRunCost } from "./catalog";
import { analyzeIntent, runTitle } from "./intent";
import { remember, retrieveMemory } from "./memory";
import { getRun, updateStore } from "./store";
import type { LlmId, PipelineEvent, Run } from "./types";

function now() {
  return new Date().toISOString();
}

function event(role: PipelineEvent["role"], message: string): PipelineEvent {
  return { at: now(), role, message };
}

const DEFAULT_MODELS: Record<"PO" | "BA" | "DEV" | "QA", LlmId> = {
  PO: "claude",
  BA: "mistral",
  DEV: "qwen",
  QA: "mistral",
};

export async function createRun(input: {
  description: string;
  models?: Partial<Record<"PO" | "BA" | "DEV" | "QA", LlmId>>;
  skills?: string[];
}): Promise<Run> {
  const description = input.description.trim();
  if (description.length < 8) {
    throw new Error("Describe the feature in a bit more detail.");
  }

  const models = { ...DEFAULT_MODELS, ...input.models };
  const skills = input.skills ?? [];
  const intent = analyzeIntent(description);

  let run!: Run;
  await updateStore((store) => {
    const retrieved = retrieveMemory(store.memory, description, 4);
    run = {
      id: crypto.randomUUID(),
      title: runTitle(description),
      description,
      createdAt: now(),
      status: "running",
      currentStage: "PO",
      models,
      skills,
      cost: estimateRunCost(models, skills.length),
      events: [
        event("SYSTEM", "Pipeline opened. Product Owner is writing the spec."),
        ...retrieved.map((hit) =>
          event("SYSTEM", `Memory hit (${hit.role}, ${(hit.score * 100).toFixed(0)}%): ${hit.text}`)
        ),
      ],
      retrievedMemory: retrieved,
    };
    store.runs.unshift(run);
  });

  const po = runProductOwner(
    description,
    run.retrievedMemory,
    intent
  );

  await updateStore((store) => {
    const current = store.runs.find((item) => item.id === run.id);
    if (!current) return;
    current.po = po;
    current.status = "awaiting_decision";
    current.decision = {
      stage: "PO",
      prompt: "Approve this plan so the Business Analyst and Developer can continue.",
    };
    current.events.push(event("PO", `Wrote ${po.stories.length} stories, ${po.risks.length} risks, and sprint scope.`));
    current.events.push(event("SYSTEM", "Human decision required: approve the Product Owner plan."));
    store.memory.push(
      remember({
        role: "PO",
        runId: current.id,
        tags: ["stories", intent.slug],
        text: `Feature "${current.title}": ${po.epic}. Scope: ${po.scope.join("; ")}`,
      })
    );
  });

  return (await getRun(run.id))!;
}

export async function decideRun(id: string, action: "approve" | "reject") {
  const existing = await getRun(id);
  if (!existing) throw new Error("Run not found");
  if (existing.status !== "awaiting_decision" || !existing.decision) {
    throw new Error("This run is not waiting on a decision.");
  }

  if (action === "reject") {
    await updateStore((store) => {
      const run = store.runs.find((item) => item.id === id);
      if (!run) return;
      run.status = "rejected";
      run.events.push(event("SYSTEM", `Human rejected the ${run.decision?.stage} stage. Pipeline stopped.`));
      run.decision = undefined;
    });
    return (await getRun(id))!;
  }

  if (existing.decision.stage === "PO") {
    return continueAfterPlan(id);
  }
  return continueAfterCode(id);
}

async function continueAfterPlan(id: string) {
  const run = (await getRun(id))!;
  const intent = analyzeIntent(run.description);

  await updateStore((store) => {
    const current = store.runs.find((item) => item.id === id);
    if (!current) return;
    current.status = "running";
    current.currentStage = "BA";
    current.decision = undefined;
    current.events.push(event("SYSTEM", "Plan approved. Business Analyst is selecting the stack."));
  });

  const ba = runBusinessAnalyst(intent, run.models.BA, run.retrievedMemory);

  await updateStore((store) => {
    const current = store.runs.find((item) => item.id === id);
    if (!current) return;
    current.ba = ba;
    current.currentStage = "DEV";
    current.events.push(
      event("BA", `Stack: ${ba.stack.map((s) => s.name).join(", ")}. ${ba.apis.length} API endpoints specified.`)
    );
    current.events.push(event("DEV", "Developer agent is generating production files from the spec."));
    store.memory.push(
      remember({
        role: "BA",
        runId: id,
        tags: ["architecture", intent.slug],
        text: ba.dataModelNotes,
      })
    );
  });

  const dev = runDeveloper(intent);

  await updateStore((store) => {
    const current = store.runs.find((item) => item.id === id);
    if (!current) return;
    current.dev = dev;
    current.status = "awaiting_decision";
    current.decision = {
      stage: "DEV",
      prompt: "Review the generated code and live preview. Approve to send it to QA.",
    };
    current.events.push(event("DEV", `Generated ${dev.files.length} files for ${dev.preview.entityName}.`));
    current.events.push(event("SYSTEM", "Human decision required: approve generated code."));
    store.memory.push(
      remember({
        role: "DEV",
        runId: id,
        tags: ["code", intent.slug],
        text: `Shipped ${dev.preview.entityName} with files ${dev.files.map((f) => f.path).join(", ")}`,
      })
    );
  });

  return (await getRun(id))!;
}

async function continueAfterCode(id: string) {
  const run = (await getRun(id))!;
  if (!run.po || !run.dev) throw new Error("Missing plan or code");

  await updateStore((store) => {
    const current = store.runs.find((item) => item.id === id);
    if (!current) return;
    current.status = "running";
    current.currentStage = "QA";
    current.decision = undefined;
    current.events.push(event("QA", "QA Engineer is running unit, integration, regression, and accessibility checks."));
  });

  const qa = runQa(run.po, run.dev);

  await updateStore((store) => {
    const current = store.runs.find((item) => item.id === id);
    if (!current) return;
    current.qa = qa;
    current.events.push(event("QA", qa.summary));
    store.memory.push(
      remember({
        role: "QA",
        runId: id,
        tags: ["qa", "coverage"],
        text: `QA coverage ${qa.coverage}% for "${current.title}". ${qa.issues.length ? qa.issues.join("; ") : "No issues."}`,
      })
    );
    current.currentStage = current.skills.length ? "SKILLS" : "DONE";
  });

  const latest = (await getRun(id))!;
  if (latest.skills.length && latest.po && latest.dev) {
    const skillResults = runSkills(latest.skills, latest.po, latest.dev);
    await updateStore((store) => {
      const current = store.runs.find((item) => item.id === id);
      if (!current) return;
      current.skillResults = skillResults;
      for (const skill of skillResults) {
        current.events.push(event("SKILL", `${skill.name}: ${skill.findings.map((f) => f.title).join("; ")}`));
      }
      current.currentStage = "DONE";
      current.status = "complete";
      current.events.push(event("SYSTEM", "Pipeline complete. Feature is ready for the squad to copy into the repo."));
    });
  } else {
    await updateStore((store) => {
      const current = store.runs.find((item) => item.id === id);
      if (!current) return;
      current.status = "complete";
      current.currentStage = "DONE";
      current.events.push(event("SYSTEM", "Pipeline complete. Feature is ready for the squad to copy into the repo."));
    });
  }

  return (await getRun(id))!;
}

export async function listWorkspace() {
  const { getStore } = await import("./store");
  const store = await getStore();
  return {
    runs: store.runs.map((run) => ({
      id: run.id,
      title: run.title,
      description: run.description,
      createdAt: run.createdAt,
      status: run.status,
      currentStage: run.currentStage,
      skills: run.skills,
    })),
    memory: {
      total: store.memory.length,
      coverage: store.memory.length ? 100 : 0,
      byRole: {
        PO: store.memory.filter((m) => m.role === "PO").length,
        BA: store.memory.filter((m) => m.role === "BA").length,
        DEV: store.memory.filter((m) => m.role === "DEV").length,
        QA: store.memory.filter((m) => m.role === "QA").length,
        SKILL: store.memory.filter((m) => m.role === "SKILL").length,
      },
      recent: store.memory
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12)
        .map(({ id, role, runId, createdAt, text, tags }) => ({
          id,
          role,
          runId,
          createdAt,
          text,
          tags,
        })),
    },
  };
}
