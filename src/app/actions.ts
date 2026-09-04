"use server";

import { redirect } from "next/navigation";
import { createRun, decideRun } from "@/lib/nova/pipeline";
import type { LlmId } from "@/lib/nova/types";

const ROLES = ["PO", "BA", "DEV", "QA"] as const;

function parseModels(formData: FormData) {
  const models = {
    PO: "claude",
    BA: "mistral",
    DEV: "qwen",
    QA: "mistral",
  } as Record<(typeof ROLES)[number], LlmId>;
  for (const role of ROLES) {
    const value = String(formData.get(`model-${role}`) ?? "");
    if (value === "claude" || value === "mistral" || value === "qwen") {
      models[role] = value;
    }
  }
  return models;
}

export async function startPipelineAction(formData: FormData) {
  const description = String(formData.get("description") ?? "").trim();
  const skills = formData.getAll("skills").map(String).filter(Boolean);
  const run = await createRun({
    description,
    models: parseModels(formData),
    skills,
  });
  redirect(`/?run=${run.id}`);
}

export async function decidePipelineAction(formData: FormData) {
  const runId = String(formData.get("runId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("Decision must be approve or reject");
  }
  const run = await decideRun(runId, decision);
  redirect(`/?run=${run.id}`);
}
