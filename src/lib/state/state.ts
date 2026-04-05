import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ManifestV2 } from "../contracts/types.js";
import type { StateV2, TaskState, RunPolicy } from "./types.js";
import { DEFAULT_POLICY } from "./types.js";
import { ConfigError } from "../errors/types.js";
import { validateStateSchema } from "../contracts/schema-validator.js";

export function loadState(statePath: string): StateV2 {
  let raw: string;
  try {
    raw = readFileSync(statePath, "utf8");
  } catch (e) {
    throw new ConfigError(statePath, `Cannot read state file: ${e instanceof Error ? e.message : String(e)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(statePath, `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const schemaResult = validateStateSchema(data);
  if (!schemaResult.valid) {
    const msgs = schemaResult.errors.map(e => `${e.path}: ${e.message}`).join("; ");
    throw new ConfigError(statePath, `Schema validation failed: ${msgs}`);
  }

  return data as StateV2;
}

export function writeState(statePath: string, state: StateV2): void {
  const dir = path.dirname(statePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function initializeState(
  manifest: ManifestV2,
  policy: RunPolicy = DEFAULT_POLICY,
): StateV2 {
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

export function computeManifestDigest(manifest: ManifestV2): string {
  const normalized = JSON.stringify({
    manifest_version: manifest.manifest_version,
    run_id: manifest.run_id,
    tasks: manifest.tasks.map(t => ({
      id: t.id,
      prompt_ref: t.prompt_ref,
      depends_on: [...t.depends_on].sort(),
      timeout_sec: t.timeout_sec,
      verify_profile: t.verify_profile,
    })),
  });
  return createHash("sha256").update(normalized).digest("hex");
}
