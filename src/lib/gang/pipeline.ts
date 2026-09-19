import { produceBaOutput } from "./agents/ba";
import { produceDevOutput } from "./agents/dev";
import { producePoOutput } from "./agents/po";
import { produceQaOutput } from "./agents/qa";
import { runSkills } from "./agents/skills";
import { analyzeIntent, runTitle } from "./intent";
import { getLlmClient } from "./llm/client";
import type { GenerateResult } from "./llm/withFallback";
import { remember } from "./memory";
import { addMemoryEntry, createRunRecord, getRun, getStore, mutateRun, querySharedContext } from "./store";
import type { PipelineEvent, Run } from "./types";

function stageSourceOf(result: GenerateResult<unknown>): NonNullable<Run["stageSource"]>[keyof NonNullable<Run["stageSource"]>] {
  return { via: result.source, provider: result.provider, model: result.model, note: result.note };
}

function now() {
  return new Date().toISOString();
}

function event(role: PipelineEvent["role"], message: string): PipelineEvent {
  return { at: now(), role, message };
}

export async function createRun(input: { description: string; skills?: string[] }): Promise<Run> {
  const description = input.description.trim();
  if (description.length < 8) {
    throw new Error("Describe the feature in a bit more detail.");
  }

  const skills = input.skills ?? [];
  const intent = analyzeIntent(description);
  const retrieved = await querySharedContext(description, 4);

  const run: Run = {
    id: crypto.randomUUID(),
    title: runTitle(description),
    description,
    createdAt: now(),
    status: "running",
    currentStage: "PO",
    skills,
    events: [
      event("SYSTEM", "The Gang is in. Product Owner is writing the spec."),
      ...retrieved.map((hit) =>
        event("SYSTEM", `Memory hit (${hit.role}, ${(hit.score * 100).toFixed(0)}%): ${hit.text}`)
      ),
    ],
    retrievedMemory: retrieved,
  };
  await createRunRecord(run);

  const client = getLlmClient();
  const poResult = await producePoOutput(client, description, run.retrievedMemory, intent);
  const po = poResult.output;

  await mutateRun(run.id, (current) => {
    current.po = po;
    current.status = "awaiting_decision";
    current.decision = {
      stage: "PO",
      prompt: "Approve this plan so the Business Analyst and Developer can continue.",
    };
    current.stageSource = { ...current.stageSource, PO: stageSourceOf(poResult) };
    current.events.push(event("PO", `Wrote ${po.stories.length} stories, ${po.risks.length} risks, and sprint scope. (${poResult.source})`));
    current.events.push(event("SYSTEM", "Human decision required: approve the Product Owner plan."));
  });
  await addMemoryEntry(
    remember({
      role: "PO",
      runId: run.id,
      tags: ["stories", intent.slug],
      text: `Feature "${run.title}": ${po.epic}. Scope: ${po.scope.join("; ")}`,
    })
  );

  return (await getRun(run.id))!;
}

export async function decideRun(id: string, action: "approve" | "reject") {
  const existing = await getRun(id);
  if (!existing) throw new Error("Run not found");
  if (existing.status !== "awaiting_decision" || !existing.decision) {
    throw new Error("This run is not waiting on a decision.");
  }

  if (action === "reject") {
    await mutateRun(id, (run) => {
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
  const client = getLlmClient();

  await mutateRun(id, (current) => {
    current.status = "running";
    current.currentStage = "BA";
    current.decision = undefined;
    current.events.push(event("SYSTEM", "Plan approved. Business Analyst is selecting the stack."));
  });

  const baResult = await produceBaOutput(client, intent, run.retrievedMemory);
  const ba = baResult.output;

  await mutateRun(id, (current) => {
    current.ba = ba;
    current.currentStage = "DEV";
    current.stageSource = { ...current.stageSource, BA: stageSourceOf(baResult) };
    current.events.push(
      event("BA", `Stack: ${ba.stack.map((s) => s.name).join(", ")}. ${ba.apis.length} API endpoints specified. (${baResult.source})`)
    );
    current.events.push(event("DEV", "Developer agent is generating production files from the spec."));
  });
  await addMemoryEntry(
    remember({
      role: "BA",
      runId: id,
      tags: ["architecture", intent.slug],
      text: ba.dataModelNotes,
    })
  );

  const devResult = await produceDevOutput(client, intent, ba);
  const dev = devResult.output;

  await mutateRun(id, (current) => {
    current.dev = dev;
    current.status = "awaiting_decision";
    current.decision = {
      stage: "DEV",
      prompt: "Review the generated code and live preview. Approve to send it to QA.",
    };
    current.stageSource = { ...current.stageSource, DEV: stageSourceOf(devResult) };
    current.events.push(event("DEV", `Generated ${dev.files.length} files for ${dev.preview.entityName}. (${devResult.source})`));
    current.events.push(event("SYSTEM", "Human decision required: approve generated code."));
  });
  await addMemoryEntry(
    remember({
      role: "DEV",
      runId: id,
      tags: ["code", intent.slug],
      text: `Shipped ${dev.preview.entityName} with files ${dev.files.map((f) => f.path).join(", ")}`,
    })
  );

  return (await getRun(id))!;
}

async function continueAfterCode(id: string) {
  const run = (await getRun(id))!;
  if (!run.po || !run.dev) throw new Error("Missing plan or code");
  const client = getLlmClient();

  await mutateRun(id, (current) => {
    current.status = "running";
    current.currentStage = "QA";
    current.decision = undefined;
    current.events.push(event("QA", "QA Engineer is running unit, integration, regression, and accessibility checks."));
  });

  const qaResult = await produceQaOutput(client, run.po, run.dev);
  const qa = qaResult.output;

  await mutateRun(id, (current) => {
    current.qa = qa;
    current.stageSource = { ...current.stageSource, QA: stageSourceOf(qaResult) };
    current.events.push(event("QA", qa.summary));
    current.currentStage = current.skills.length ? "SKILLS" : "DONE";
  });
  await addMemoryEntry(
    remember({
      role: "QA",
      runId: id,
      tags: ["qa", "coverage"],
      text: `QA coverage ${qa.coverage}% for "${run.title}". ${qa.issues.length ? qa.issues.join("; ") : "No issues."}`,
    })
  );

  const latest = (await getRun(id))!;
  if (latest.skills.length && latest.po && latest.dev) {
    const skillResults = runSkills(latest.skills, latest.po, latest.dev);
    await mutateRun(id, (current) => {
      current.skillResults = skillResults;
      for (const skill of skillResults) {
        current.events.push(event("SKILL", `${skill.name}: ${skill.findings.map((f) => f.title).join("; ")}`));
      }
      current.currentStage = "DONE";
      current.status = "complete";
      current.events.push(event("SYSTEM", "The Gang is done. Feature is ready to copy into the repo."));
    });
  } else {
    await mutateRun(id, (current) => {
      current.status = "complete";
      current.currentStage = "DONE";
      current.events.push(event("SYSTEM", "The Gang is done. Feature is ready to copy into the repo."));
    });
  }

  return (await getRun(id))!;
}

export async function listWorkspace() {
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
        .map(({ id, role, runId, createdAt, text, tags, source }) => ({
          id,
          role,
          runId,
          createdAt,
          text,
          tags,
          source,
        })),
    },
  };
}
