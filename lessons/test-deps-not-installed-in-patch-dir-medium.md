# Test Dependencies Not Installed in Patch Directory

**Threat Level**: MEDIUM
**Discovered**: Run 2 (manual verification after schema fix)
**Impact**: Verification gate fails on test execution -- task marked FAILED even though all files are correct

## Problem

After fixing the Ajv schema issue, re-running against the existing patch files showed:

```
GHSA-952p-6rrq-rcjv: Verification failed: Tests failed (exit 1):
    code: 'MODULE_NOT_FOUND',
    requireStack: [ '.../patches/GHSA-952p-6rrq-rcjv/exploit.test.mjs' ]
```

The test file does `import('micromatch')` but there was no `node_modules` directory in the patch output folder. The worker had installed micromatch in `/tmp/vuln-GHSA-952p-6rrq-rcjv/` during development, ran the tests there, then copied the artifacts to `patches/` -- but didn't copy the dependency.

## Root Cause

The original worker prompt told Claude to:
1. Create a temp dir and install deps there
2. Write and test in the temp dir
3. Copy output files to the patches dir

Step 3 copied the test and patch files but not the `package.json` or `node_modules`. The test was designed to run in an environment where the vulnerable package is already installed, but the verification gate runs tests in the patch directory which had no dependencies.

## Resolution

Two changes:

1. **Updated worker prompt** to write a `package.json` directly in the output directory (`patches/GHSA-xxxx/`) declaring the vulnerable package as a dependency. This makes each patch folder self-contained.

2. **Updated `verify.ts`** to auto-detect a `package.json` in the patch directory and run `npm install --no-audit --no-fund` before executing tests. The `ensureDepsInstalled()` function checks if `node_modules` already exists (skip if so) and installs if not.

## Prevention

Self-contained output directories are the right pattern for a patch database. Each patch folder should be independently runnable with just:

```bash
cd patches/GHSA-xxxx
npm install
node --test exploit.test.mjs
```

The worker prompt now explicitly requires the `package.json` as a mandatory output file.
