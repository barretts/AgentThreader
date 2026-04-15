# Ajv ESM/CJS Import Interop

**Threat Level**: LOW
**Discovered**: Build phase (TypeScript compilation)
**Impact**: Build failure -- project won't compile until resolved

## Problem

Multiple TypeScript compilation errors when importing Ajv in an ESM project:

```
error TS2709: Cannot use namespace 'Ajv' as a type.
error TS2351: This expression is not constructable.
  Type 'typeof import(".../ajv/dist/ajv")' has no construct signatures.
error TS2344: Type '...' does not satisfy the constraint 'abstract new (...args: any) => any'.
```

The project uses `"type": "module"` in package.json and `"module": "NodeNext"` in tsconfig.json. Ajv publishes both CJS and ESM entry points, but the TypeScript type definitions don't align cleanly with the ESM default export.

## Root Cause

Ajv's package exports a class as `export default class Ajv`, but when consumed via ESM with TypeScript's `NodeNext` module resolution, the default import resolves to the module namespace rather than the class constructor. This means:

- `import Ajv from "ajv"` gives you the module namespace, not the class
- `new Ajv()` fails because the namespace is not constructable
- `InstanceType<typeof Ajv>` fails because the namespace is not a class

This is a well-known pain point in the Node.js ESM/CJS interop story.

## Resolution

Used `createRequire` to load Ajv via CJS require, which returns the class constructor directly:

```typescript
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Ajv = require("ajv") as typeof import("ajv").default;
```

This gives full type safety while avoiding the ESM interop issues.

## Attempts That Failed

1. `import Ajv from "ajv"` -- namespace, not constructable
2. `import AjvModule from "ajv"; const Ajv = AjvModule as unknown as typeof AjvModule.default;` -- `InstanceType` constraint fails
3. `import Ajv, { type ValidateFunction } from "ajv"` -- same namespace issue

## Prevention

When using CJS-first packages (ajv, chalk v4, commander v11) in ESM TypeScript projects, `createRequire` is the most reliable approach. It bypasses the ESM default export ambiguity entirely.
