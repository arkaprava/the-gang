import { connection } from "next/server";
import { ConsoleApp } from "@/components/console/console-app";
import { listWorkspace } from "@/lib/nova/pipeline";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  await connection();
  const initialWorkspace = await listWorkspace();
  return <ConsoleApp initialWorkspace={initialWorkspace} />;
}
