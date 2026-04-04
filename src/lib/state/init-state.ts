import { readFileSync } from "node:fs";
import type { ManifestV2 } from "../contracts/types.js";
import type { RunPolicy } from "./types.js";
import { DEFAULT_POLICY } from "./types.js";
import { initializeState, writeState } from "./state.js";
import { ConfigError } from "../errors/types.js";
import { validateManifestSchema } from "../contracts/schema-validator.js";

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
}

export async function initState(options: InitStateOptions): Promise<InitStateResult> {
  const outputPath = options.outputPath ?? ".agentic/state.json";

  let raw: string;
  try {
    raw = readFileSync(options.manifestPath, "utf8");
  } catch (e) {
    throw new ConfigError(options.manifestPath, `Cannot read manifest: ${e instanceof Error ? e.message : String(e)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(options.manifestPath, `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const schemaResult = validateManifestSchema(data);
  if (!schemaResult.valid) {
    const msgs = schemaResult.errors.map(e => `${e.path}: ${e.message}`).join("; ");
    throw new ConfigError(options.manifestPath, `Schema validation failed: ${msgs}`);
  }

  const manifest = data as ManifestV2;

  const policy: RunPolicy = { ...DEFAULT_POLICY };

  if (options.heal) {
    const valid = ["auto", "off", "task", "batch", "epoch"] as const;
    if (valid.includes(options.heal as typeof valid[number])) {
      policy.heal_schedule = options.heal as RunPolicy["heal_schedule"];
    }
  }

  if (options.batchStrategy) {
    const valid = ["fibonacci", "fixed"] as const;
    if (valid.includes(options.batchStrategy as typeof valid[number])) {
      policy.batch_strategy = options.batchStrategy as RunPolicy["batch_strategy"];
    }
  }

  const state = initializeState(manifest, policy);
  writeState(outputPath, state);

  return {
    statePath: outputPath,
    runId: state.run_id,
    taskCount: manifest.tasks.length,
    policy: state.policy,
  };
}
