import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

test("task prompt includes required sentinel fences", () => {
  const taskPrompt = readFileSync("prompts/task.md", "utf8");
  assert.match(taskPrompt, /<<<TASK_RESULT_V2>>>/);
  assert.match(taskPrompt, /<<<END_TASK_RESULT_V2>>>/);
  assert.match(taskPrompt, /\{\{TASK_ID\}\}/);
  assert.match(taskPrompt, /\{\{CONTEXT\}\}/);
});

test("healer prompt includes required sentinel fences", () => {
  const healerPrompt = readFileSync("prompts/healer.md", "utf8");
  assert.match(healerPrompt, /<<<HEAL_DECISION_V2>>>/);
  assert.match(healerPrompt, /<<<END_HEAL_DECISION_V2>>>/);
  assert.match(healerPrompt, /\{\{FAILED_SUMMARIES\}\}/);
  assert.match(healerPrompt, /\{\{LOG_TAILS\}\}/);
});

test("manifest tasks reference prompts and verify profiles", () => {
  const manifest = readJson("manifest.json");
  assert.equal(manifest.manifest_version, "2.0");
  assert.ok(Array.isArray(manifest.tasks));
  assert.ok(manifest.tasks.length > 0);

  for (const task of manifest.tasks) {
    assert.equal(typeof task.id, "string");
    assert.equal(typeof task.prompt_ref, "string");
    assert.equal(typeof task.verify_profile, "string");
    assert.match(task.prompt_ref, /^prompts\//);
  }
});

test("verify profiles define at least one step", () => {
  const verifyProfiles = readJson("verify-profiles.json");
  assert.ok(verifyProfiles.profiles);
  assert.ok(verifyProfiles.profiles.default);
  assert.ok(Array.isArray(verifyProfiles.profiles.default.steps));
  assert.ok(verifyProfiles.profiles.default.steps.length > 0);
});
