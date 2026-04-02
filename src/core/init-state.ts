import { readFileSync } from "node:fs";
import type { ManifestV2, RunPolicy } from "./types.js";
import { initializeState, writeState } from "./state.js";
import { ConfigError } from "../errors/types.js";

export interface InitStateOptions {
  manifestPath: string;
  outputPath?: string;
  heal?: string;
  batchStrategy?: string;
}

export interface InitStateResult {
  statePath: string;
  runId: string;
  taskCount: number;
  policy: RunPolicy;
  warnings: string[];
}

export async function initState(options: InitStateOptions): Promise<InitStateResult> {
  const warnings: string[] = [];

  let raw: string;
  try {
    raw = readFileSync(options.manifestPath, "utf8");
  } catch (e) {
    throw new ConfigError(options.manifestPath, `Cannot read manifest: ${e instanceof Error ? e.message : String(e)}`);
  }

  let manifest: ManifestV2;
  try {
    manifest = JSON.parse(raw) as ManifestV2;
  } catch (e) {
    throw new ConfigError(options.manifestPath, `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (manifest.manifest_version !== "2.0") {
    throw new ConfigError(options.manifestPath, `Expected manifest_version "2.0", got "${String(manifest.manifest_version)}"`);
  }

  const policyOverrides: Partial<RunPolicy> = {};
  if (options.heal) {
    const valid = ["auto", "off", "task", "batch", "epoch"] as const;
    if (!valid.includes(options.heal as typeof valid[number])) {
      throw new ConfigError("--heal", `Must be one of: ${valid.join(", ")}`);
    }
    policyOverrides.heal_schedule = options.heal as RunPolicy["heal_schedule"];
  }
  if (options.batchStrategy) {
    const valid = ["fibonacci", "fixed"] as const;
    if (!valid.includes(options.batchStrategy as typeof valid[number])) {
      throw new ConfigError("--batch-strategy", `Must be one of: ${valid.join(", ")}`);
    }
    policyOverrides.batch_strategy = options.batchStrategy as RunPolicy["batch_strategy"];
  }

  const state = initializeState(manifest, policyOverrides);
  const statePath = options.outputPath ?? ".agentic/state.json";

  await writeState(statePath, state);

  return {
    statePath,
    runId: state.run_id,
    taskCount: manifest.tasks.length,
    policy: state.policy,
    warnings,
  };
}
