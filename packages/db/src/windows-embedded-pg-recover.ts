import { createConnection } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Detects the Windows embedded-PG error where a previous postmaster left shared
 * memory behind (crash, killed console, old dev runner, etc.).
 */
export function isWindowsSharedMemoryStuckState(message: string, recentLogs: string[]): boolean {
  if (process.platform !== "win32") return false;
  const combined = `${message}\n${recentLogs.join("\n")}`.toLowerCase();
  return (
    combined.includes("pre-existing shared memory") ||
    combined.includes("shared memory block is still in use")
  );
}

/**
 * Kills all `postgres.exe` processes. This is safe for the common dev setup
 * where Paperclip is the only local Postgres. Users running other local
 * servers should set PAPERCLIP_WINDOWS_EMBEDDED_PG_STOMP=0 and use
 * DATABASE_URL or free resources manually.
 */
export async function stompWindowsPostgresProcesses(): Promise<void> {
  if (process.platform !== "win32") return;
  if (process.env.PAPERCLIP_WINDOWS_EMBEDDED_PG_STOMP === "0") return;

  try {
    await execFileAsync("taskkill", ["/F", "/IM", "postgres.exe"], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { status?: number; stderr?: string };
    const text = `${err.stderr ?? ""} ${err.message ?? ""}`.toLowerCase();
    const code = typeof err.status === "number" ? err.status : err.code;
    // 128: no such process. Still ignore other failures: retrying start is the real fix.
    if (code === 128 || text.includes("not found") || text.includes("not running")) return;
  }
}

export async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves when something accepts TCP on host:port, or when deadlineMs is reached.
 * Used so postgres.js does not hang indefinitely while embedded postmaster is still booting.
 */
export async function waitForLocalPortAcceptingConnections(
  host: string,
  port: number,
  deadlineMs: number,
  pollMs = 200,
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const canConnect = await new Promise<boolean>((resolve) => {
      const c = createConnection({ host, port });
      const done = (ok: boolean) => {
        c.removeAllListeners();
        c.destroy();
        resolve(ok);
      };
      c.setTimeout(2000, () => done(false));
      c.once("connect", () => done(true));
      c.once("error", () => done(false));
    });
    if (canConnect) return;
    await sleepMs(pollMs);
  }
  throw new Error(
    `Timed out after ${deadlineMs}ms waiting for ${host}:${port} to accept connections (embedded PostgreSQL may still be starting)`,
  );
}
