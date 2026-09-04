import { ConsoleApp } from "@/components/console/console-app";
import { listWorkspace } from "@/lib/nova/pipeline";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialWorkspace = await listWorkspace();
  return <ConsoleApp initialWorkspace={initialWorkspace} />;
}
