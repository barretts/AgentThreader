import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scaffold } from '../../../src/lib/scaffold/scaffold.js';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpBase = path.join(os.tmpdir(), 'agent-threader-scaffold-test');

function uniqueDir(): string {
  return path.join(tmpBase, `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

beforeEach(() => { mkdirSync(tmpBase, { recursive: true }); });
afterEach(() => { rmSync(tmpBase, { recursive: true, force: true }); });

describe('scaffold', () => {
  it('creates all expected files', () => {
    const dir = uniqueDir();
    const result = scaffold({ targetDir: dir, projectName: 'my-project' });

    expect(result.filesCreated.length).toBeGreaterThanOrEqual(9);
    expect(result.skipped).toHaveLength(0);
    expect(existsSync(path.join(dir, 'package.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'src/orchestrator.ts'))).toBe(true);
    expect(existsSync(path.join(dir, 'src/my-adapter.ts'))).toBe(true);
    expect(existsSync(path.join(dir, 'manifest.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'prompts/task.md'))).toBe(true);
    expect(existsSync(path.join(dir, 'prompts/healer.md'))).toBe(true);
    expect(existsSync(path.join(dir, 'test/contracts.test.mjs'))).toBe(true);
  });

  it('includes TDD test script and contract guidance', () => {
    const dir = uniqueDir();
    scaffold({ targetDir: dir, projectName: 'tdd-bot' });

    const pkg = readFileSync(path.join(dir, 'package.json'), 'utf8');
    expect(pkg).toContain('"test": "node --test test/**/*.test.mjs"');

    const taskPrompt = readFileSync(path.join(dir, 'prompts/task.md'), 'utf8');
    expect(taskPrompt).toContain('## Execution Guidance');
    expect(taskPrompt).toContain('If a task affects behavior, update or add tests before finalizing.');

    const healerPrompt = readFileSync(path.join(dir, 'prompts/healer.md'), 'utf8');
    expect(healerPrompt).toContain('Identify the root cause of failures (not just symptoms).');
    expect(healerPrompt).toContain('Propose the smallest patch set likely to fix the root cause.');
  });

  it('substitutes project name in templates', () => {
    const dir = uniqueDir();
    scaffold({ targetDir: dir, projectName: 'cool-bot' });

    const pkg = readFileSync(path.join(dir, 'package.json'), 'utf8');
    expect(pkg).toContain('"name": "cool-bot"');

    const readme = readFileSync(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('# cool-bot');

    const manifest = readFileSync(path.join(dir, 'manifest.json'), 'utf8');
    expect(manifest).toContain('"run_id": "cool-bot-001"');
  });

  it('defaults project name from directory basename', () => {
    const dir = uniqueDir();
    const result = scaffold({ targetDir: dir });
    expect(result.projectName).toBe(path.basename(dir));
  });

  it('skips existing files without --force', () => {
    const dir = uniqueDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), 'existing', 'utf8');

    const result = scaffold({ targetDir: dir });
    expect(result.skipped).toContain('package.json');
    expect(readFileSync(path.join(dir, 'package.json'), 'utf8')).toBe('existing');
  });

  it('overwrites existing files with --force', () => {
    const dir = uniqueDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), 'existing', 'utf8');

    const result = scaffold({ targetDir: dir, force: true, projectName: 'forced' });
    expect(result.filesCreated).toContain('package.json');
    expect(result.skipped).not.toContain('package.json');

    const pkg = readFileSync(path.join(dir, 'package.json'), 'utf8');
    expect(pkg).toContain('"name": "forced"');
  });
});
