import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "onboarding-assets");
const dest = join(root, "dist", "onboarding-assets");
const parent = dirname(dest);
if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
if (existsSync(dest)) rmSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
