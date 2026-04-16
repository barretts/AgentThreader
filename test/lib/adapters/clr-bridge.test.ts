import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createClrAdapter } from '../../../src/lib/adapters/clr-bridge.js';
import type { ManifestTaskV2 } from '../../../src/lib/contracts/types.js';
import type { RunContext } from '../../../src/lib/adapters/types.js';

// Minimal CLR module mock. Records invocations so tests can assert
// mapping behavior without touching node-pty, disk, or the network.
interface MockCalls {
  drive: Array<{ profile: unknown; opts: Record<string, unknown> }>;
  selectAdapter: Array<{ profile: unknown; task: unknown }>;
  loadProfile: Array<string>;
}

function makeMockClr(overrides: {
  driveResult?: Record<string, unknown>;
  outputAdapterResult?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  throwOnDrive?: Error;
  parserFailure?: boolean;
} = {}) {
  const calls: MockCalls = { drive: [], selectAdapter: [], loadProfile: [] };

  const defaultProfile = {
    schema_version: '1.0',
    tool_id: 'mock-tool',
    tool_command: 'mock-tool',
    interaction_mode: 'args',
    launch: { default_args: [], env: {}, needs_pty: true, startup_timeout_sec: 10 },
    states: {},
    transitions: [],
    timing: { typical_startup_sec: 1, idle_threshold_sec: 2, max_session_sec: 60 },
    learned_patterns: [],
    confidence: 1,
    probe_count: 1,
    last_updated: '2025-01-01',
  };

  const defaultDriveResult = {
    success: true,
    final_state: 'completed',
    transcript_path: '/tmp/mock.jsonl',
    output: 'mock output',
    duration_ms: 1234,
  };

  const module = {
    async drive(profile: unknown, opts: Record<string, unknown>) {
      calls.drive.push({ profile, opts });
      if (overrides.throwOnDrive) throw overrides.throwOnDrive;
      return overrides.driveResult ?? defaultDriveResult;
    },
    async loadProfile(id: string) {
      calls.loadProfile.push(id);
      return overrides.profile ?? defaultProfile;
    },
    selectAdapter(profile: unknown, task: unknown) {
      calls.selectAdapter.push({ profile, task });
      return {
        id: 'mock-output-adapter',
        async extractResult(driveResult: Record<string, unknown>, t: { id: string }) {
          if (overrides.parserFailure) {
            return { kind: 'invalid_json' as const, error: 'bad json' };
          }
          return (
            overrides.outputAdapterResult ?? {
              task_id: t.id,
              status: 'DONE' as const,
              output: driveResult.output,
              summary: 'mock summary',
            }
          );
        },
      };
    },
    isClrParserFailure(v: unknown): v is { kind: string; error: string } {
      return typeof v === 'object' && v !== null && 'kind' in v;
    },
  };

  // Bridge uses `as any` cast so extra properties are fine.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { loadClr: async () => module as any, calls, profile: overrides.profile ?? defaultProfile };
}

function makeCtx(repoRoot: string): RunContext {
  return {
    repoRoot,
    logsDir: path.join(repoRoot, '.logs'),
    sharedContextPaths: [],
    contractHints: new Map(),
    policy: {
      max_worker_attempts_per_task: 2,
      max_heal_rounds_per_window: 2,
      max_total_heal_rounds: 8,
      signature_repeat_limit: 2,
      failure_threshold: 0.2,
      heal_schedule: 'auto',
      batch_strategy: 'fibonacci',
      current_batch_size: 1,
      concurrency: 1,
    },
  };
}

const task: ManifestTaskV2 = {
  id: 'test-task',
  prompt_ref: 'hello world',
  depends_on: [],
  timeout_sec: 60,
  verify_profile: 'default',
};

describe('ClrCliAdapter', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'at-clr-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preset drives argv and prompt delivery for arg-mode tools', () => {
    const { loadClr } = makeMockClr();
    const adapter = createClrAdapter({ presetId: 'crush', loadClr });
    const invocation = adapter.prepare(task, makeCtx(tmpDir));
    expect(invocation.argv[0]).toBe('crush');
    expect(invocation.argv).toContain('run');
    expect(invocation.argv[invocation.argv.length - 1]).toBe('hello world');
    expect(invocation.stdin).toBeNull();
    expect(invocation.scope).toBe('task');
    expect(adapter.capabilities.argPrompt).toBe(true);
    expect(adapter.capabilities.pty).toBe(true);
  });

  it('preset routes prompt to stdin for claude', () => {
    const { loadClr } = makeMockClr();
    const adapter = createClrAdapter({ presetId: 'claude', loadClr });
    const invocation = adapter.prepare(task, makeCtx(tmpDir));
    expect(invocation.stdin).toBe('hello world');
    expect(adapter.capabilities.stdinPrompt).toBe(true);
  });

  it('execute maps DriveResult success into exitCode 0 artifact', async () => {
    const mock = makeMockClr();
    const adapter = createClrAdapter({ presetId: 'crush', loadClr: mock.loadClr });
    const ctx = makeCtx(tmpDir);
    const invocation = adapter.prepare(task, ctx);
    const artifact = await adapter.execute(invocation, ctx);
    expect(artifact.exitCode).toBe(0);
    expect(artifact.durationMs).toBe(1234);
    expect(readFileSync(artifact.logPath, 'utf8')).toBe('mock output');
    expect(existsSync(artifact.logPath + '.cliresult.json')).toBe(true);
    expect(mock.calls.drive).toHaveLength(1);
    expect(mock.calls.drive[0].opts.input).toBe('hello world');
    expect(mock.calls.drive[0].opts.max_session_ms).toBe(60000);
  });

  it('execute surfaces drive() exception as exit-1 artifact', async () => {
    const mock = makeMockClr({ throwOnDrive: new Error('pty spawn failed') });
    const adapter = createClrAdapter({ presetId: 'crush', loadClr: mock.loadClr });
    const ctx = makeCtx(tmpDir);
    const artifact = await adapter.execute(adapter.prepare(task, ctx), ctx);
    expect(artifact.exitCode).toBe(1);
    expect(artifact.lastLogTail).toContain('pty spawn failed');
  });

  it('extractResult returns TaskResultV2 on success', async () => {
    const mock = makeMockClr();
    const adapter = createClrAdapter({ presetId: 'crush', loadClr: mock.loadClr });
    const ctx = makeCtx(tmpDir);
    const artifact = await adapter.execute(adapter.prepare(task, ctx), ctx);
    const result = await adapter.extractResult(artifact, ctx);
    if ('ok' in result) throw new Error('expected success, got ParserFailure');
    expect(result.contract_version).toBe('2.0');
    expect(result.status).toBe('DONE');
    expect(result.summary).toBe('mock summary');
    expect(result.evidence?.notes?.some((n: string) => n.includes('final_state=completed'))).toBe(true);
  });

  it('extractResult returns ParserFailure on CLR parser error', async () => {
    const mock = makeMockClr({ parserFailure: true });
    const adapter = createClrAdapter({ presetId: 'crush', loadClr: mock.loadClr });
    const ctx = makeCtx(tmpDir);
    const artifact = await adapter.execute(adapter.prepare(task, ctx), ctx);
    const result = await adapter.extractResult(artifact, ctx);
    expect('ok' in result && result.ok === false).toBe(true);
    if ('ok' in result && result.ok === false) {
      expect(result.code).toBe('INVALID_JSON');
    }
  });

  it('executeSingle uses project root cwd (healer path)', async () => {
    const mock = makeMockClr();
    const adapter = createClrAdapter({ presetId: 'crush', loadClr: mock.loadClr });
    const ctx = makeCtx(tmpDir);
    const invocation = adapter.prepare(task, ctx);
    await adapter.executeSingle('heal this', invocation, ctx);
    const lastDrive = mock.calls.drive[mock.calls.drive.length - 1];
    expect(lastDrive.opts.workDir).toBe(ctx.repoRoot);
    expect(lastDrive.opts.input).toBe('heal this');
  });

  it('throws actionable error when CLR peer dep missing', async () => {
    const adapter = createClrAdapter({
      presetId: 'crush',
      loadClr: async () => {
        throw new Error('simulated missing module');
      },
    });
    const ctx = makeCtx(tmpDir);
    const invocation = adapter.prepare(task, ctx);
    await expect(adapter.execute(invocation, ctx)).rejects.toThrow(/cli-runner-learner is not installed/);
  });
});
