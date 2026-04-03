import path from "node:path";
import type { WriteEntry } from "../contracts/types.js";

export interface WriteSafetyOptions {
  workspaceRoot: string;
  protectedPaths?: string[];
  shrinkageThreshold?: number;
  shrinkageMinBytes?: number;
}

export interface WriteSafetyResult {
  safe: boolean;
  errors: string[];
  warnings: string[];
}

const DEFAULT_SHRINKAGE_THRESHOLD = 0.5;
const DEFAULT_SHRINKAGE_MIN_BYTES = 100;

export function validateWrites(
  writes: WriteEntry[],
  options: WriteSafetyOptions,
  existingFileSizes?: Map<string, number>,
): WriteSafetyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const threshold = options.shrinkageThreshold ?? DEFAULT_SHRINKAGE_THRESHOLD;
  const minBytes = options.shrinkageMinBytes ?? DEFAULT_SHRINKAGE_MIN_BYTES;
  const protectedSet = new Set(options.protectedPaths ?? []);

  for (const write of writes) {
    const normalized = path.normalize(write.path);

    if (path.isAbsolute(normalized)) {
      errors.push(`Write path is absolute: ${write.path}`);
      continue;
    }

    const resolved = path.resolve(options.workspaceRoot, normalized);
    if (!resolved.startsWith(options.workspaceRoot)) {
      errors.push(`Write path escapes workspace root: ${write.path}`);
      continue;
    }

    if (protectedSet.has(normalized) || protectedSet.has(write.path)) {
      errors.push(`Write targets protected file: ${write.path}`);
      continue;
    }

    if (write.op === "replace" && existingFileSizes) {
      const existingSize = existingFileSizes.get(normalized) ?? existingFileSizes.get(write.path);
      if (existingSize !== undefined && existingSize > minBytes) {
        const newSize = write.content?.length ?? 0;
        if (newSize < existingSize * threshold) {
          errors.push(
            `Shrinkage detected for ${write.path}: existing ${existingSize}B -> proposed ${newSize}B (${Math.round((newSize / existingSize) * 100)}% of original)`,
          );
        }
      }
    }

    if (!write.content && !write.content_ref) {
      errors.push(`Write entry for ${write.path} has neither content nor content_ref`);
    }
  }

  return {
    safe: errors.length === 0,
    errors,
    warnings,
  };
}
