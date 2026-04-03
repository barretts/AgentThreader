import { describe, it, expect } from 'vitest';
import {
  buildDependencyOrder,
  getReadyTasks,
  isTerminalStatus,
  isRunComplete,
} from '../../../src/lib/orchestrator/scheduling.js';
import type { ManifestTaskV2 } from '../../../src/lib/contracts/types.js';
import type { TaskState } from '../../../src/lib/state/types.js';

function makeTask(id: string, depends_on: string[] = [], priority?: number): ManifestTaskV2 {
  return { id, prompt_ref: `prompts/${id}.md`, depends_on, timeout_sec: 300, verify_profile: 'default', priority };
}

function makeTaskState(status: TaskState['status']): TaskState {
  return {
    status,
    worker_attempts: 0,
    healer_attempts: 0,
    last_failure_class: null,
    last_failure_signature: null,
    applied_patch_ids: [],
    history: [],
  };
}

describe('buildDependencyOrder', () => {
  it('returns topological order for a simple chain', () => {
    const tasks = [makeTask('C', ['B']), makeTask('B', ['A']), makeTask('A')];
    const result = buildDependencyOrder(tasks);
    expect(result.hasCycle).toBe(false);
    expect(result.order).toEqual(['A', 'B', 'C']);
  });

  it('detects cycles', () => {
    const tasks = [makeTask('A', ['B']), makeTask('B', ['A'])];
    const result = buildDependencyOrder(tasks);
    expect(result.hasCycle).toBe(true);
    expect(result.cycleMembers.sort()).toEqual(['A', 'B']);
  });

  it('respects priority within the same depth', () => {
    const tasks = [makeTask('A', [], 3), makeTask('B', [], 1), makeTask('C', [], 2)];
    const result = buildDependencyOrder(tasks);
    expect(result.order).toEqual(['B', 'C', 'A']);
  });
});

describe('getReadyTasks', () => {
  it('returns tasks with all deps DONE', () => {
    const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['A'])];
    const states: Record<string, TaskState> = {
      A: makeTaskState('DONE'),
      B: makeTaskState('PENDING'),
      C: makeTaskState('PENDING'),
    };
    const ready = getReadyTasks(tasks, states, ['A', 'B', 'C']);
    expect(ready.sort()).toEqual(['B', 'C']);
  });

  it('does not return tasks with unfinished deps', () => {
    const tasks = [makeTask('A'), makeTask('B', ['A'])];
    const states: Record<string, TaskState> = {
      A: makeTaskState('RUNNING'),
      B: makeTaskState('PENDING'),
    };
    const ready = getReadyTasks(tasks, states, ['A', 'B']);
    expect(ready).toEqual([]);
  });
});

describe('isTerminalStatus', () => {
  it('DONE is terminal', () => expect(isTerminalStatus('DONE')).toBe(true));
  it('ESCALATED is terminal', () => expect(isTerminalStatus('ESCALATED')).toBe(true));
  it('PENDING is not terminal', () => expect(isTerminalStatus('PENDING')).toBe(false));
  it('RUNNING is not terminal', () => expect(isTerminalStatus('RUNNING')).toBe(false));
});

describe('isRunComplete', () => {
  it('returns true when all tasks are terminal or blocked', () => {
    const states: Record<string, TaskState> = {
      A: makeTaskState('DONE'),
      B: makeTaskState('ESCALATED'),
      C: makeTaskState('BLOCKED'),
    };
    expect(isRunComplete(states)).toBe(true);
  });

  it('returns false when tasks are still pending', () => {
    const states: Record<string, TaskState> = {
      A: makeTaskState('DONE'),
      B: makeTaskState('PENDING'),
    };
    expect(isRunComplete(states)).toBe(false);
  });
});
