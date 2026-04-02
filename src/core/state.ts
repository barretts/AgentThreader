import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { StateV2, ManifestV2, RunPolicy, TaskState } from "./types.js";
import { DEFAULT_POLICY } from "./types.js";
import { ConfigError } from "../errors/types.js";

export function loadState(filePath: string): StateV2 {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (e) {
    throw new ConfigError(filePath, `Cannot read state file: ${e instanceof Error ? e.message : String(e)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(filePath, `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const obj = data as Record<string, unknown>;
  if (obj.state_version !== "2.0") {
    throw new ConfigError(filePath, `Expected state_version "2.0", got "${String(obj.state_version)}"`);
  }

  return data as StateV2;
}

export async function writeState(filePath: string, state: StateV2): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.tmp`);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

export function computeManifestDigest(manifest: ManifestV2): string {
  const normalized = JSON.stringify(manifest);
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

export function initializeState(
  manifest: ManifestV2,
  policyOverrides?: Partial<RunPolicy>,
): StateV2 {
  const policy: RunPolicy = { ...DEFAULT_POLICY, ...policyOverrides };

  const tasks: Record<string, TaskState> = {};
  for (const task of manifest.tasks) {
    tasks[task.id] = {
      status: "PENDING",
      worker_attempts: 0,
      healer_attempts: 0,
      last_failure_class: null,
      last_failure_signature: null,
      applied_patch_ids: [],
      history: [],
    };
  }

  return {
    state_version: "2.0",
    run_id: manifest.run_id,
    run_status: "RUNNING",
    abort_reason: null,
    manifest_digest: computeManifestDigest(manifest),
    policy,
    tasks,
    healing_rounds: [],
  };
}
