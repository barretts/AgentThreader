import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv, { type ValidateFunction, type ErrorObject } from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

const validatorCache = new Map<string, ValidateFunction>();

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaError[];
}

export interface SchemaError {
  path: string;
  message: string;
  keyword: string;
}

function findSchemasDir(): string {
  // Resolve relative to this module's location in either src or dist
  const moduleDir = path.dirname(new URL(import.meta.url).pathname);
  // From src/lib/contracts/ or dist/lib/contracts/ -> project root -> skill/schemas
  const projectRoot = path.resolve(moduleDir, '..', '..', '..');
  return path.join(projectRoot, 'skill', 'schemas');
}

function getValidator(schemaFile: string): ValidateFunction {
  const cached = validatorCache.get(schemaFile);
  if (cached) return cached;

  const schemasDir = findSchemasDir();
  const schemaPath = path.join(schemasDir, schemaFile);
  const raw = readFileSync(schemaPath, "utf8");
  const schema = JSON.parse(raw);

  // Strip $schema and $id -- default Ajv does not support draft-2020-12
  // meta-schema, and $id causes collision errors on repeated loads.
  delete schema.$schema;
  delete schema.$id;

  const validate = ajv.compile(schema);
  validatorCache.set(schemaFile, validate);
  return validate;
}

function formatErrors(errors: ErrorObject[] | null | undefined): SchemaError[] {
  if (!errors) return [];
  return errors.map((e) => ({
    path: e.instancePath || "/",
    message: e.message ?? "unknown error",
    keyword: e.keyword,
  }));
}

export function validateManifestSchema(data: unknown): SchemaValidationResult {
  const validate = getValidator("manifest.v2.json");
  const valid = validate(data);
  return { valid: !!valid, errors: formatErrors(validate.errors) };
}

export function validateTaskResultSchema(data: unknown): SchemaValidationResult {
  const validate = getValidator("task_result.v2.json");
  const valid = validate(data);
  return { valid: !!valid, errors: formatErrors(validate.errors) };
}

export function validateHealDecisionSchema(data: unknown): SchemaValidationResult {
  const validate = getValidator("heal_decision.v2.json");
  const valid = validate(data);
  return { valid: !!valid, errors: formatErrors(validate.errors) };
}

export function validateStateSchema(data: unknown): SchemaValidationResult {
  const validate = getValidator("state.v2.json");
  const valid = validate(data);
  return { valid: !!valid, errors: formatErrors(validate.errors) };
}

export function validateVerifyProfileSchema(data: unknown): SchemaValidationResult {
  const validate = getValidator("verify_profile.v2.json");
  const valid = validate(data);
  return { valid: !!valid, errors: formatErrors(validate.errors) };
}
