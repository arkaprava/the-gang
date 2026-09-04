import { NextResponse } from "next/server";
import { decideRun } from "@/lib/nova/pipeline";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { action?: "approve" | "reject" };
    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
    }
    const run = await decideRun(id, body.action);
    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Decision failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
