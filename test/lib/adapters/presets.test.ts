import { describe, it, expect } from 'vitest';
import {
  CLAUDE_PRESET, CRUSH_PRESET, CURSOR_PRESET,
  getAdapterPreset, listAdapterPresets, buildArgv,
} from '../../../src/lib/adapters/presets.js';

describe('adapter presets', () => {
  it('all three presets are defined', () => {
    expect(listAdapterPresets().sort()).toEqual(['claude', 'crush', 'cursor']);
  });

  it('getAdapterPreset returns correct preset', () => {
    expect(getAdapterPreset('claude')).toBe(CLAUDE_PRESET);
    expect(getAdapterPreset('crush')).toBe(CRUSH_PRESET);
    expect(getAdapterPreset('cursor')).toBe(CURSOR_PRESET);
  });

  it('returns undefined for unknown preset', () => {
    expect(getAdapterPreset('unknown')).toBeUndefined();
  });
});

describe('CLAUDE_PRESET', () => {
  it('uses stdin for prompt delivery', () => {
    expect(CLAUDE_PRESET.promptDelivery).toBe('stdin');
  });

  it('does not ignore stdin', () => {
    expect(CLAUDE_PRESET.stdinIgnore).toBe(false);
  });

  it('includes --print and --dangerously-skip-permissions', () => {
    expect(CLAUDE_PRESET.defaultArgs).toContain('--print');
    expect(CLAUDE_PRESET.defaultArgs).toContain('--dangerously-skip-permissions');
  });

  it('tool calls are visible in stdout', () => {
    expect(CLAUDE_PRESET.toolCallsHiddenInStdout).toBe(false);
  });
});

describe('CRUSH_PRESET', () => {
  it('uses positional arg for prompt delivery', () => {
    expect(CRUSH_PRESET.promptDelivery).toBe('positional-arg');
  });

  it('ignores stdin (lesson: crush-prompt-not-from-stdin)', () => {
    expect(CRUSH_PRESET.stdinIgnore).toBe(true);
  });

  it('forbids --yolo (lesson: crush-yolo-flag-not-on-run)', () => {
    expect(CRUSH_PRESET.forbiddenArgs).toContain('--yolo');
  });

  it('includes --debug alongside --verbose (lesson: crush-debug-flag-gives-thinking)', () => {
    expect(CRUSH_PRESET.defaultArgs).toContain('--debug');
    expect(CRUSH_PRESET.defaultArgs).toContain('--verbose');
  });

  it('tool calls are hidden in stdout', () => {
    expect(CRUSH_PRESET.toolCallsHiddenInStdout).toBe(true);
  });

  it('has session management config', () => {
    expect(CRUSH_PRESET.sessionIdPattern).toBeInstanceOf(RegExp);
    expect(CRUSH_PRESET.sessionContinueFlag).toBe('--session');
    expect(CRUSH_PRESET.sessionShowCommand).toBeDefined();
  });

  it('needs line buffering', () => {
    expect(CRUSH_PRESET.needsLineBuffering).toBe(true);
  });

  it('has noise filter patterns', () => {
    expect(CRUSH_PRESET.noisePatterns.length).toBeGreaterThan(0);
    expect(CRUSH_PRESET.noisePatterns.some(p => p.test('Failed to walk skills path'))).toBe(true);
    expect(CRUSH_PRESET.noisePatterns.some(p => p.test('localhost:8000'))).toBe(true);
  });
});

describe('CURSOR_PRESET', () => {
  it('uses flag for prompt delivery', () => {
    expect(CURSOR_PRESET.promptDelivery).toBe('flag');
    expect(CURSOR_PRESET.promptFlag).toBe('--prompt');
  });

  it('includes --print', () => {
    expect(CURSOR_PRESET.defaultArgs).toContain('--print');
  });
});

describe('buildArgv', () => {
  it('builds claude argv with stdin prompt', () => {
    const { argv, stdin } = buildArgv(CLAUDE_PRESET, 'Hello');
    expect(stdin).toBe('Hello');
    expect(argv).not.toContain('Hello');
    expect(argv).toContain('--print');
  });

  it('builds crush argv with positional prompt', () => {
    const { argv, stdin } = buildArgv(CRUSH_PRESET, 'Fix the bug');
    expect(stdin).toBeNull();
    expect(argv[argv.length - 1]).toBe('Fix the bug');
    expect(argv).toContain('run');
  });

  it('builds cursor argv with --prompt flag', () => {
    const { argv, stdin } = buildArgv(CURSOR_PRESET, 'Do the thing');
    expect(stdin).toBeNull();
    expect(argv).toContain('--prompt');
    const promptIdx = argv.indexOf('--prompt');
    expect(argv[promptIdx + 1]).toBe('Do the thing');
  });

  it('adds --cwd when specified', () => {
    const { argv } = buildArgv(CRUSH_PRESET, 'test', { cwd: '/my/dir' });
    expect(argv).toContain('--cwd');
    expect(argv[argv.indexOf('--cwd') + 1]).toBe('/my/dir');
  });

  it('adds session flag for crush', () => {
    const { argv } = buildArgv(CRUSH_PRESET, 'test', { sessionId: 'abc-123' });
    expect(argv).toContain('--session');
    expect(argv[argv.indexOf('--session') + 1]).toBe('abc-123');
  });

  it('ignores session for claude (no session support)', () => {
    const { argv } = buildArgv(CLAUDE_PRESET, 'test', { sessionId: 'abc-123' });
    expect(argv).not.toContain('--session');
  });

  it('appends extra args', () => {
    const { argv } = buildArgv(CLAUDE_PRESET, 'test', { extraArgs: ['--add-dir', '/tmp'] });
    expect(argv).toContain('--add-dir');
    expect(argv).toContain('/tmp');
  });
});
