import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Run } from "../lib/gang/types";

export async function writeShipped(run: Run) {
  if (!run.dev) return [];
  const root = path.join(process.cwd(), "shipped", run.dev.preview.slug);
  const written: string[] = [];
  for (const file of run.dev.files) {
    const dest = path.join(root, file.path);
    // `file.path` is generator-produced, but guard against it ever escaping
    // the run's own shipped/<slug> directory (e.g. via a stray "../").
    const relative = path.relative(root, dest);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Refusing to write outside shipped/${run.dev.preview.slug}: ${file.path}`);
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, file.content, "utf8");
    written.push(path.relative(process.cwd(), dest));
  }
  return written;
}
