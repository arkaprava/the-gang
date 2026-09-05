import { NextResponse } from "next/server";
import { addUserContext, querySharedContext } from "@/lib/nova/store";
import { listWorkspace } from "@/lib/nova/pipeline";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  if (query) {
    const hits = await querySharedContext(query, 12);
    return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
  }
  const workspace = await listWorkspace();
  return NextResponse.json(
    { entries: workspace.memory.recent, total: workspace.memory.total },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; tags?: string[] };
    const text = body.text?.trim() ?? "";
    if (text.length < 8) {
      return NextResponse.json({ error: "Context text must be a bit more specific." }, { status: 400 });
    }
    const entry = await addUserContext(text, body.tags ?? ["user"]);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not store context";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
