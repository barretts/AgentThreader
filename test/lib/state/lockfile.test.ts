import { describe, it, expect, afterEach } from 'vitest';
import { acquireLock, releaseLock, forceAcquireLock } from '../../../src/lib/state/lockfile.js';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpBase = path.join(os.tmpdir(), 'agent-threader-lockfile-test');
function uniqueDir(): string {
  return path.join(tmpBase, `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

afterEach(() => { rmSync(tmpBase, { recursive: true, force: true }); });

describe('acquireLock', () => {
  it('acquires lock in empty directory', () => {
    const dir = uniqueDir();
    const result = acquireLock(dir);
    expect(result.acquired).toBe(true);
    expect(existsSync(result.lockPath)).toBe(true);
    const pid = readFileSync(result.lockPath, 'utf8').trim();
    expect(Number(pid)).toBe(process.pid);
  });

  it('acquires stale lock from dead process', () => {
    const dir = uniqueDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '.lock'), '999999\n', 'utf8');

    const result = acquireLock(dir);
    // PID 999999 is almost certainly dead
    expect(result.acquired).toBe(true);
  });

  it('refuses lock when another process holds it', () => {
    const dir = uniqueDir();
    // Use parent process PID (always alive while tests run)
    const ppid = process.ppid;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '.lock'), `${ppid}\n`, 'utf8');

    const result = acquireLock(dir);
    expect(result.acquired).toBe(false);
    expect(result.existingPid).toBe(ppid);
    expect(result.existingPidAlive).toBe(true);
  });
});

describe('releaseLock', () => {
  it('removes lock owned by current process', () => {
    const dir = uniqueDir();
    acquireLock(dir);
    expect(existsSync(path.join(dir, '.lock'))).toBe(true);
    releaseLock(dir);
    expect(existsSync(path.join(dir, '.lock'))).toBe(false);
  });

  it('does not remove lock owned by another process', () => {
    const dir = uniqueDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '.lock'), `${process.ppid}\n`, 'utf8');
    releaseLock(dir);
    // Lock should still exist since we don't own it
    expect(existsSync(path.join(dir, '.lock'))).toBe(true);
  });

  it('is safe to call when no lock exists', () => {
    const dir = uniqueDir();
    mkdirSync(dir, { recursive: true });
    expect(() => releaseLock(dir)).not.toThrow();
  });
});

describe('forceAcquireLock', () => {
  it('overrides existing lock', () => {
    const dir = uniqueDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '.lock'), `${process.ppid}\n`, 'utf8');

    const result = forceAcquireLock(dir);
    expect(result.acquired).toBe(true);
    const pid = readFileSync(result.lockPath, 'utf8').trim();
    expect(Number(pid)).toBe(process.pid);
  });
});
