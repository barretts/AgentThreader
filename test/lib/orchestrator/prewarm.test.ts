import { describe, it, expect } from 'vitest';
import {
  prewarmToolchains,
  dedupeRequirements,
  type PrewarmRequirement,
} from '../../../src/lib/orchestrator/prewarm.js';

describe('dedupeRequirements', () => {
  it('collapses exact (manager, version) duplicates', () => {
    const reqs: PrewarmRequirement[] = [
      { manager: 'nvm', version: '20.11.0' },
      { manager: 'nvm', version: '20.11.0' },
      { manager: 'nvm', version: '18.19.0' },
      { manager: 'pyenv', version: '3.12.1' },
    ];
    expect(dedupeRequirements(reqs)).toEqual([
      { manager: 'nvm', version: '20.11.0' },
      { manager: 'nvm', version: '18.19.0' },
      { manager: 'pyenv', version: '3.12.1' },
    ]);
  });
});

describe('prewarmToolchains', () => {
  it('installs each unique requirement exactly once, sequentially', async () => {
    const calls: string[] = [];
    const reqs: PrewarmRequirement[] = [
      { manager: 'nvm', version: '20.11.0' },
      { manager: 'nvm', version: '20.11.0' },
      { manager: 'nvm', version: '18.19.0' },
    ];

    const result = await prewarmToolchains(reqs, async (req) => {
      calls.push(`${req.manager}@${req.version}`);
      // Assert no overlap — calls must be strictly sequential.
      await new Promise((r) => setTimeout(r, 5));
      return { alreadyPresent: false };
    });

    expect(calls).toEqual(['nvm@20.11.0', 'nvm@18.19.0']);
    expect(result.allSucceeded).toBe(true);
    expect(result.outcomes.map((o) => o.status)).toEqual(['installed', 'installed']);
  });

  it('captures per-requirement failures without throwing', async () => {
    const result = await prewarmToolchains(
      [
        { manager: 'nvm', version: '20.11.0' },
        { manager: 'nvm', version: '99.0.0' },
      ],
      async (req) => {
        if (req.version === '99.0.0') throw new Error('no such version');
        return { alreadyPresent: true };
      },
    );

    expect(result.allSucceeded).toBe(false);
    expect(result.outcomes[0].status).toBe('already_present');
    expect(result.outcomes[1].status).toBe('failed');
    expect(result.outcomes[1].error).toBe('no such version');
  });

  it('serializes installs even when the caller would otherwise overlap', async () => {
    let active = 0;
    let maxActive = 0;

    await prewarmToolchains(
      [
        { manager: 'nvm', version: '1' },
        { manager: 'nvm', version: '2' },
        { manager: 'nvm', version: '3' },
      ],
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return { alreadyPresent: false };
      },
    );

    expect(maxActive).toBe(1);
  });
});
