import fs from "node:fs/promises";

interface FileSnapshot {
  mtimeMs: number;
  size: number;
}

interface StalenessResult {
  stale: boolean;
  message?: string;
}

const sessions = new Map<string, Map<string, FileSnapshot>>();

function sessionKey(sessionId: string | undefined): string {
  return sessionId || "default";
}

function snapshotEqual(left: FileSnapshot, right: FileSnapshot): boolean {
  return left.size === right.size && Math.abs(left.mtimeMs - right.mtimeMs) < 1;
}

async function readSnapshot(absolutePath: string): Promise<FileSnapshot | null> {
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) return null;
    return { mtimeMs: stats.mtimeMs, size: stats.size };
  } catch {
    return null;
  }
}

export async function refreshFileBaseline(sessionId: string | undefined, absolutePath: string): Promise<void> {
  const snapshot = await readSnapshot(absolutePath);
  if (!snapshot) return;
  const key = sessionKey(sessionId);
  let files = sessions.get(key);
  if (!files) {
    files = new Map();
    sessions.set(key, files);
  }
  files.set(absolutePath, snapshot);
}

export async function checkFileStaleness(sessionId: string | undefined, absolutePath: string): Promise<StalenessResult> {
  const files = sessions.get(sessionKey(sessionId));
  const baseline = files?.get(absolutePath);
  if (!baseline) return { stale: false };
  const current = await readSnapshot(absolutePath);
  if (!current) return { stale: false };
  if (snapshotEqual(baseline, current)) return { stale: false };
  return {
    stale: true,
    message:
      "File changed after it was last read by this agent session. Read it again before overwriting so external edits are not lost.",
  };
}

export function clearFileBaselines(sessionId?: string): void {
  if (sessionId) {
    sessions.delete(sessionKey(sessionId));
    return;
  }
  sessions.clear();
}
