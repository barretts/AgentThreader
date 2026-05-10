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
const MANIFEST_PATH = path.join(SKILL_DIR, "build", "manifest.json");
const COMPILED_DIR = path.join(ROOT, "compiled");
const MANAGED_MARKER = "managed_by: agent-threader";

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`  ERROR: manifest not found: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw);
  const skills = manifest?.skills;

  if (!skills || typeof skills !== "object" || Array.isArray(skills)) {
    console.error("  ERROR: manifest.json must contain an object at skills");
    process.exit(1);
  }

  return manifest;
}

function getSkillEntries(manifest) {
  return Object.entries(manifest.skills);
}

function getVariantEntries(skillConfig) {
  const variants = skillConfig?.variants;
  if (variants === undefined) return [];
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) {
    return null;
  }
  return Object.entries(variants);
}

function extractIncludes(raw) {
  return [...new Set([...raw.matchAll(/\{\{include:([\w/.-]+)\}\}/g)].map(([, ref]) => ref))];
}

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

function compileSkill(skillName, sourceRelPath, managedMarker = MANAGED_MARKER) {
  const skillSrc = path.join(SKILL_DIR, sourceRelPath);
  if (!existsSync(skillSrc)) {
    console.error(`  ERROR: skill source not found: ${skillSrc}`);
    process.exit(1);
  }
  const raw = readFileSync(skillSrc, "utf8");
  const compiled = resolveIncludes(raw, path.dirname(skillSrc));
  return `<!-- ${managedMarker} -->\n${compiled}`;
}

// ─── Validation mode ─────────────────────────────────────────────────────────

function validateSourceRefs(label, source, declaredFragments) {
  let errors = 0;

  if (typeof source !== "string" || source.length === 0) {
    console.error(`  INVALID: ${label} must declare a non-empty source path`);
    errors++;
    return errors;
  }

  const skillSrc = path.join(SKILL_DIR, source);
  if (!existsSync(skillSrc)) {
    console.error(`  MISSING: ${label} source -> ${source}`);
    errors++;
    return errors;
  }

  const raw = readFileSync(skillSrc, "utf8");
  const referenced = extractIncludes(raw);

  for (const ref of referenced) {
    const fragPath = path.join(FRAGMENTS_DIR, ref);
    if (!existsSync(fragPath)) {
      console.error(`  MISSING: ${label} include -> ${ref}`);
      errors++;
    }
    if (!declaredFragments.includes(ref)) {
      console.error(`  UNDECLARED: ${label} includes ${ref} but manifest does not declare it`);
      errors++;
    }
  }

  for (const ref of declaredFragments) {
    const fragPath = path.join(FRAGMENTS_DIR, ref);
    if (!existsSync(fragPath)) {
      console.error(`  MISSING: ${label} declared fragment -> ${ref}`);
      errors++;
    }
    if (!referenced.includes(ref)) {
      console.error(`  UNUSED: ${label} declares ${ref} but source does not include it`);
      errors++;
    }
  }

  return errors;
}

function validateOutputPath(label, outputPath) {
  if (typeof outputPath !== "string" || outputPath.length === 0) {
    console.error(`  INVALID: ${label} must declare a non-empty output path`);
    return 1;
  }
  if (path.isAbsolute(outputPath) || outputPath.split(/[\\/]+/).includes("..")) {
    console.error(`  INVALID: ${label} output path must stay inside compiled/: ${outputPath}`);
    return 1;
  }
  return 0;
}

function validateFragmentRefs() {
  let errors = 0;
  const manifest = loadManifest();
  const skillEntries = getSkillEntries(manifest);

  for (const [skillName, skillConfig] of skillEntries) {
    if (!skillConfig || typeof skillConfig !== "object") {
      console.error(`  INVALID: ${skillName} manifest entry must be an object`);
      errors++;
      continue;
    }

    const declaredFragments = Array.isArray(skillConfig.fragments) ? skillConfig.fragments : [];
    errors += validateSourceRefs(skillName, skillConfig.source, declaredFragments);

    const variantEntries = getVariantEntries(skillConfig);
    if (variantEntries === null) {
      console.error(`  INVALID: ${skillName} variants must be an object`);
      errors++;
      continue;
    }

    for (const [variantName, variantConfig] of variantEntries) {
      const label = `${skillName}:${variantName}`;
      if (!variantConfig || typeof variantConfig !== "object" || Array.isArray(variantConfig)) {
        console.error(`  INVALID: ${label} manifest entry must be an object`);
        errors++;
        continue;
      }
      const variantFragments = Array.isArray(variantConfig.fragments) ? variantConfig.fragments : [];
      errors += validateSourceRefs(label, variantConfig.source, variantFragments);
      errors += validateOutputPath(label, variantConfig.path);
    }
  }

  if (errors > 0) {
    console.error(`\nValidation failed: ${errors} issue(s).`);
    process.exit(1);
  }
  console.log("Manifest and fragment references are valid.");
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

function emitVariant(skillName, variantName, variantConfig, compiledContent) {
  const outputPath = variantConfig?.path;
  const label = `${skillName}:${variantName}`;
  if (validateOutputPath(label, outputPath) > 0) {
    process.exit(1);
  }
  emit(path.join(COMPILED_DIR, outputPath), compiledContent);
}

// ─── Main build ──────────────────────────────────────────────────────────────

function build() {
  console.log("==> Compiling skills...");
  const manifest = loadManifest();
  const skillEntries = getSkillEntries(manifest);

  for (const [skillName, skillConfig] of skillEntries) {
    const source = skillConfig?.source;
    if (typeof source !== "string" || source.length === 0) {
      console.error(`  ERROR: ${skillName} must declare a non-empty source path in manifest`);
      process.exit(1);
    }
    console.log(`  ${skillName}:`);
    const compiled = compileSkill(skillName, source);

    emitClaude(skillName, compiled);
    emitCursor(skillName, compiled);
    emitWindsurf(skillName, compiled);
    emitOpencode(skillName, compiled);
    emitCodex(skillName, compiled);

    const variantEntries = getVariantEntries(skillConfig);
    if (variantEntries === null) {
      console.error(`  ERROR: ${skillName} variants must be an object`);
      process.exit(1);
    }
    for (const [variantName, variantConfig] of variantEntries) {
      const variantSource = variantConfig?.source;
      if (typeof variantSource !== "string" || variantSource.length === 0) {
        console.error(`  ERROR: ${skillName}:${variantName} must declare a non-empty source path in manifest`);
        process.exit(1);
      }
      const variantCompiled = compileSkill(skillName, variantSource, `${MANAGED_MARKER}-${variantName}`);
      emitVariant(skillName, variantName, variantConfig, variantCompiled);
    }
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
  watchFile(MANIFEST_PATH, { interval: 1000 }, () => {
    console.log(`\nChange detected: ${path.relative(ROOT, MANIFEST_PATH)}`);
    build();
  });
} else {
  build();
}
