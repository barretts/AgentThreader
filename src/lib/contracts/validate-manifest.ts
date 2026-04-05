import { readFileSync } from "node:fs";
import type { ManifestV2 } from "./types.js";
import { ConfigError } from "../errors/types.js";
import { validateManifestSchema } from "./schema-validator.js";

export interface ValidateManifestOptions {
  manifestPath: string;
}

export interface Issue {
  severity: "error" | "warning";
  message: string;
}

export interface ValidateManifestResult {
  valid: boolean;
  taskCount: number;
  issues: Issue[];
  dependencyOrder: string[];
  warnings: string[];
}

export function validateManifest(options: ValidateManifestOptions): ValidateManifestResult {
  const issues: Issue[] = [];
  const warnings: string[] = [];

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
    for (const err of schemaResult.errors) {
      issues.push({ severity: "error", message: `${err.path}: ${err.message}` });
    }
    return { valid: false, taskCount: 0, issues, dependencyOrder: [], warnings };
  }

  const manifest = data as ManifestV2;
  const taskIds = new Set<string>();
  const duplicates = new Set<string>();

  for (const task of manifest.tasks) {
    if (!task.id || typeof task.id !== "string") {
      issues.push({ severity: "error", message: "Task missing id" });
      continue;
    }

    if (taskIds.has(task.id)) {
      duplicates.add(task.id);
    }
    taskIds.add(task.id);

    if (!task.prompt_ref) {
      issues.push({ severity: "error", message: `Task ${task.id}: missing prompt_ref` });
    }

    if (!Array.isArray(task.depends_on)) {
      issues.push({ severity: "error", message: `Task ${task.id}: missing depends_on array` });
    }

    if (typeof task.timeout_sec !== "number" || task.timeout_sec <= 0) {
      issues.push({ severity: "error", message: `Task ${task.id}: timeout_sec must be > 0` });
    }

    if (!task.verify_profile) {
      issues.push({ severity: "error", message: `Task ${task.id}: missing verify_profile` });
    }
  }

  for (const dup of duplicates) {
    issues.push({ severity: "error", message: `Duplicate task id: ${dup}` });
  }

  for (const task of manifest.tasks) {
    if (!Array.isArray(task.depends_on)) continue;
    for (const dep of task.depends_on) {
      if (!taskIds.has(dep)) {
        issues.push({ severity: "error", message: `Task ${task.id}: depends_on references unknown task "${dep}"` });
      }
    }
  }

  const depOrder = topologicalSort(manifest.tasks, issues);

  const valid = issues.every(i => i.severity !== "error");

  return {
    valid,
    taskCount: manifest.tasks.length,
    issues,
    dependencyOrder: depOrder,
    warnings,
  };
}

function topologicalSort(tasks: ManifestV2["tasks"], issues: Issue[]): string[] {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const task of tasks) {
    graph.set(task.id, []);
    inDegree.set(task.id, 0);
  }

  for (const task of tasks) {
    if (!Array.isArray(task.depends_on)) continue;
    for (const dep of task.depends_on) {
      if (!graph.has(dep)) continue;
      graph.get(dep)!.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
    }
  }

  // Priority-aware: lower priority value = earlier in queue
  const priorityMap = new Map<string, number>();
  for (const task of tasks) {
    priorityMap.set(task.id, task.priority ?? Infinity);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  queue.sort((a, b) => (priorityMap.get(a) ?? Infinity) - (priorityMap.get(b) ?? Infinity));

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const ready: string[] = [];
    for (const neighbor of graph.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) ready.push(neighbor);
    }
    ready.sort((a, b) => (priorityMap.get(a) ?? Infinity) - (priorityMap.get(b) ?? Infinity));
    queue.push(...ready);
  }

  if (order.length < tasks.length) {
    const inCycle = tasks.filter(t => !order.includes(t.id)).map(t => t.id);
    issues.push({ severity: "error", message: `Circular dependency detected involving: ${inCycle.join(", ")}` });
  }

  return order;
}
