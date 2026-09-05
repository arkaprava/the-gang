import { connection } from "next/server";
import { TerminalApp } from "@/components/terminal/terminal-app";
import { listWorkspace } from "@/lib/nova/pipeline";
import { getRun } from "@/lib/nova/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  await connection();
  const { run: runId } = await searchParams;
  const initialWorkspace = await listWorkspace();
  const initialRun = runId ? ((await getRun(runId)) ?? null) : null;
  return <TerminalApp key={initialRun?.id ?? "empty"} initialWorkspace={initialWorkspace} initialRun={initialRun} />;
}
