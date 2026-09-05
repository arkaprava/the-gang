import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Run } from "../lib/nova/types";

export async function writeShipped(run: Run) {
  if (!run.dev) return [];
  const root = path.join(process.cwd(), "shipped", run.dev.preview.slug);
  const written: string[] = [];
  for (const file of run.dev.files) {
    const dest = path.join(root, file.path);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, file.content, "utf8");
    written.push(path.relative(process.cwd(), dest));
  }
  return written;
}
