import type { HealPatch } from "../contracts/types.js";

const ALLOWED_RUNTIME_KEYS = new Set(["timeout_sec", "concurrency", "current_batch_size"]);

const FORBIDDEN_RUNTIME_KEYS = new Set([
  "heal_schedule",
  "batch_strategy",
  "failure_threshold",
  "max_worker_attempts_per_task",
  "max_heal_rounds_per_window",
  "max_total_heal_rounds",
  "signature_repeat_limit",
]);

export interface PatchValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePatch(
  patch: HealPatch,
  currentWindowTaskIds: string[],
  healSchedule: string,
): PatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (patch.target === "runtime_patch") {
    if (patch.content && typeof patch.content === "object") {
      for (const key of Object.keys(patch.content)) {
        if (FORBIDDEN_RUNTIME_KEYS.has(key)) {
          errors.push(`Runtime patch attempts to modify forbidden key: ${key}`);
        } else if (!ALLOWED_RUNTIME_KEYS.has(key)) {
          warnings.push(`Runtime patch modifies unknown key: ${key}`);
        }
      }
    }
  }

  if (patch.target === "task_prompt" && patch.task_id) {
    if (healSchedule === "task" && !currentWindowTaskIds.includes(patch.task_id)) {
      errors.push(`Task-scope healer cannot patch task outside window: ${patch.task_id}`);
    }
  }

  if (patch.target === "shared_context" && healSchedule === "task") {
    errors.push("Task-scope healer cannot modify shared context");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validatePatchSet(
  patches: HealPatch[],
  currentWindowTaskIds: string[],
  healSchedule: string,
): PatchValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (let i = 0; i < patches.length; i++) {
    const result = validatePatch(patches[i], currentWindowTaskIds, healSchedule);
    for (const e of result.errors) {
      allErrors.push(`patch[${i}]: ${e}`);
    }
    for (const w of result.warnings) {
      allWarnings.push(`patch[${i}]: ${w}`);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
