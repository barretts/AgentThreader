#!/usr/bin/env node

// compile.mjs -- Assemble compiled/ output from skill fragments and platform wrappers.
// Usage:
//   node skill/build/compile.mjs              # build compiled/ directory
//   node skill/build/compile.mjs --validate   # validate fragment references only
//   node skill/build/compile.mjs --watch      # rebuild on changes (basic poll)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, watchFile } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const SKILL_DIR = path.join(ROOT, "skill");
const FRAGMENTS_DIR = path.join(SKILL_DIR, "fragments");
const SKILLS_DIR = path.join(SKILL_DIR, "skills");
const PLATFORMS_DIR = path.join(ROOT, "platforms");
const COMPILED_DIR = path.join(ROOT, "compiled");
const MANAGED_MARKER = "managed_by: agent-threader";

// ─── Fragment inclusion ──────────────────────────────────────────────────────

function resolveIncludes(content, baseDir) {
  return content.replace(/\{\{include:([\w/.-]+)\}\}/g, (_match, ref) => {
    const fragPath = path.join(FRAGMENTS_DIR, ref);
    if (!existsSync(fragPath)) {
      console.warn(`  WARNING: fragment not found: ${ref}`);
      return `<!-- MISSING FRAGMENT: ${ref} -->`;
    }
    const fragContent = readFileSync(fragPath, "utf8").trim();
    // Recursively resolve nested includes
    return resolveIncludes(fragContent, path.dirname(fragPath));
  });
}

function compileSkill(skillName) {
  const skillSrc = path.join(SKILLS_DIR, skillName, `${skillName}.md`);
  if (!existsSync(skillSrc)) {
    console.error(`  ERROR: skill source not found: ${skillSrc}`);
    process.exit(1);
  }
  const raw = readFileSync(skillSrc, "utf8");
  const compiled = resolveIncludes(raw, path.dirname(skillSrc));
  return `<!-- ${MANAGED_MARKER} -->\n${compiled}`;
}

// ─── Validation mode ─────────────────────────────────────────────────────────

function validateFragmentRefs() {
  let errors = 0;
  const skillDirs = readdirSync(SKILLS_DIR).filter(d =>
    statSync(path.join(SKILLS_DIR, d)).isDirectory()
  );

  for (const skillName of skillDirs) {
    const skillSrc = path.join(SKILLS_DIR, skillName, `${skillName}.md`);
    if (!existsSync(skillSrc)) continue;
    const raw = readFileSync(skillSrc, "utf8");
    const refs = [...raw.matchAll(/\{\{include:([\w/.-]+)\}\}/g)];
    for (const [, ref] of refs) {
      const fragPath = path.join(FRAGMENTS_DIR, ref);
      if (!existsSync(fragPath)) {
        console.error(`  MISSING: ${skillName} -> ${ref}`);
        errors++;
      }
    }
  }

  if (errors > 0) {
    console.error(`\nValidation failed: ${errors} missing fragment(s).`);
    process.exit(1);
  }
  console.log("All fragment references valid.");
}

// ─── Emit helpers ────────────────────────────────────────────────────────────

function emit(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
  console.log(`  wrote: ${path.relative(ROOT, filePath)}`);
}

// ─── Platform emitters ───────────────────────────────────────────────────────

function emitClaude(skillName, compiledContent) {
  emit(path.join(COMPILED_DIR, "claude", skillName, "SKILL.md"), compiledContent);
}

function emitCursor(skillName, compiledContent) {
  // Cursor rule (.mdc)
  const ruleContent = [
    `---`,
    `description: "${skillName} skill"`,
    `globs: []`,
    `alwaysApply: false`,
    `---`,
    ``,
    compiledContent,
  ].join("\n");
  emit(path.join(COMPILED_DIR, "cursor", "rules", `${skillName}.mdc`), ruleContent);
  // Cursor skill
  emit(path.join(COMPILED_DIR, "cursor", "skills", skillName, "SKILL.md"), compiledContent);
}

function emitWindsurf(skillName, compiledContent) {
  // Windsurf rule
  emit(path.join(COMPILED_DIR, "windsurf", "rules", `${skillName}.md`), compiledContent);
  // Windsurf skill
  emit(path.join(COMPILED_DIR, "windsurf", "skills", skillName, "SKILL.md"), compiledContent);
}

function emitOpencode(skillName, compiledContent) {
  emit(path.join(COMPILED_DIR, "opencode", `${skillName}.md`), compiledContent);
}

function emitCodex(skillName, compiledContent) {
  emit(path.join(COMPILED_DIR, "codex", skillName, "SKILL.md"), compiledContent);
}

// ─── Main build ──────────────────────────────────────────────────────────────

function build() {
  console.log("==> Compiling skills...");

  const skillDirs = readdirSync(SKILLS_DIR).filter(d =>
    statSync(path.join(SKILLS_DIR, d)).isDirectory()
  );

  for (const skillName of skillDirs) {
    console.log(`  ${skillName}:`);
    const compiled = compileSkill(skillName);

    emitClaude(skillName, compiled);
    emitCursor(skillName, compiled);
    emitWindsurf(skillName, compiled);
    emitOpencode(skillName, compiled);
    emitCodex(skillName, compiled);
  }

  console.log("==> Done.");
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--validate")) {
  validateFragmentRefs();
} else if (args.includes("--watch")) {
  build();
  console.log("\nWatching for changes...");
  const watchDirs = [FRAGMENTS_DIR, SKILLS_DIR];
  for (const dir of watchDirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir, { recursive: true });
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (statSync(fullPath).isFile()) {
        watchFile(fullPath, { interval: 1000 }, () => {
          console.log(`\nChange detected: ${path.relative(ROOT, fullPath)}`);
          build();
        });
      }
    }
  }
} else {
  build();
}
