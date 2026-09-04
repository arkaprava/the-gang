import { NextResponse } from "next/server";
import { createRun } from "@/lib/nova/pipeline";
import type { LlmId } from "@/lib/nova/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      description?: string;
      models?: Partial<Record<"PO" | "BA" | "DEV" | "QA", LlmId>>;
      skills?: string[];
    };
    const run = await createRun({
      description: body.description ?? "",
      models: body.models,
      skills: body.skills,
    });
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start pipeline";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
