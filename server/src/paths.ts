import fs from "node:fs";
import path from "node:path";
import { resolveDefaultConfigPath, resolvePaperclipInstanceId } from "./home-paths.js";

const PAPERCLIP_CONFIG_BASENAME = "config.json";
const PAPERCLIP_ENV_FILENAME = ".env";
const DEFAULT_INSTANCE_ID = "default";

function findConfigFileFromAncestors(startDir: string): string | null {
  const absoluteStartDir = path.resolve(startDir);
  let currentDir = absoluteStartDir;

  while (true) {
    const candidate = path.resolve(currentDir, ".paperclip", PAPERCLIP_CONFIG_BASENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const nextDir = path.resolve(currentDir, "..");
    if (nextDir === currentDir) break;
    currentDir = nextDir;
  }

  return null;
}

/**
 * Resolve which config.json defines the instance. Order matters:
 * 1) Explicit PAPERCLIP_CONFIG
 * 2) When using the default instance id, the user profile instance
 *    (`~/.paperclip/instances/default/config.json` if that file exists) wins over
 *    any `repo/.paperclip/config.json` found by walking up from `server/` cwd.
 *    Otherwise pnpm dev from the monorepo would load the wrong .env and ignore DATABASE_URL
 *    in the real instance directory.
 * 3) Worktree / repo .paperclip from ancestor walk
 * 4) Fallback: default path (may not exist yet)
 */
export function resolvePaperclipConfigPath(overridePath?: string): string {
  if (overridePath) return path.resolve(overridePath);
  if (process.env.PAPERCLIP_CONFIG) return path.resolve(process.env.PAPERCLIP_CONFIG);

  let instanceId: string;
  try {
    instanceId = resolvePaperclipInstanceId();
  } catch {
    instanceId = DEFAULT_INSTANCE_ID;
  }
  if (instanceId === DEFAULT_INSTANCE_ID) {
    const homeDefault = resolveDefaultConfigPath();
    if (fs.existsSync(homeDefault)) {
      return homeDefault;
    }
  }

  return findConfigFileFromAncestors(process.cwd()) ?? resolveDefaultConfigPath();
}

export function resolvePaperclipEnvPath(overrideConfigPath?: string): string {
  return path.resolve(path.dirname(resolvePaperclipConfigPath(overrideConfigPath)), PAPERCLIP_ENV_FILENAME);
}
