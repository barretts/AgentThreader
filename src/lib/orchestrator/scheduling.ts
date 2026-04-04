import type { ManifestTaskV2 } from "../contracts/types.js";
import type { TaskState, TaskStatus } from "../state/types.js";

export interface SchedulingResult {
  order: string[];
  hasCycle: boolean;
  cycleMembers: string[];
}

export function buildDependencyOrder(tasks: ManifestTaskV2[]): SchedulingResult {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const priorityMap = new Map<string, number>();

  for (const task of tasks) {
    graph.set(task.id, []);
    inDegree.set(task.id, 0);
    priorityMap.set(task.id, task.priority ?? Infinity);
  }

  const taskIdSet = new Set(graph.keys());

  for (const task of tasks) {
    if (!Array.isArray(task.depends_on)) continue;
    for (const dep of task.depends_on) {
      if (!taskIdSet.has(dep)) continue;
      graph.get(dep)!.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
    }
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

  const hasCycle = order.length < tasks.length;
  const cycleMembers = hasCycle
    ? tasks.filter(t => !order.includes(t.id)).map(t => t.id)
    : [];

  return { order, hasCycle, cycleMembers };
}

export function getReadyTasks(
  tasks: ManifestTaskV2[],
  taskStates: Record<string, TaskState>,
  dependencyOrder: string[],
): string[] {
  const ready: string[] = [];

  for (const taskId of dependencyOrder) {
    const state = taskStates[taskId];
    if (!state) continue;
    if (state.status !== "PENDING") continue;

    const task = tasks.find(t => t.id === taskId);
    if (!task) continue;

    const depsReady = task.depends_on.every(dep => {
      const depState = taskStates[dep];
      return depState && depState.status === "DONE";
    });

    if (depsReady) {
      ready.push(taskId);
    }
  }

  return ready;
}

export function isTerminalStatus(status: TaskStatus): boolean {
  return status === "DONE" || status === "ESCALATED";
}

export function isRunComplete(taskStates: Record<string, TaskState>): boolean {
  return Object.values(taskStates).every(
    ts => isTerminalStatus(ts.status) || ts.status === "BLOCKED",
  );
}
