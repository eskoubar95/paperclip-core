import { chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "win32") process.exit(0);
const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
chmodSync(dist, 0o755);
