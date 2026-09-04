import { NextResponse } from "next/server";
import { listWorkspace } from "@/lib/nova/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listWorkspace();
  return NextResponse.json(data);
}
