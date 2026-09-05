import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (existsSync(full)) {
      config({ path: full, override: false, quiet: true });
    }
  }
}
