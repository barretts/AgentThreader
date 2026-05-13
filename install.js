#!/usr/bin/env node
/**
 * install.js -- Unified cross-platform installer for AgentThreader
 *
 * Replaces the split shell/PowerShell install-local scripts with a single
 * cross-platform Node.js installer that:
 *   - Runs npm install + npm run build + npm run compile + npm link
 *   - Copies compiled skill outputs to IDE-specific directories
 *   - Supports marker-based stale file cleanup
 *   - Auto-detects installed tools when no flags are provided
 *
 * Usage (local clone):
 *   node install.js [--all]
 *   node install.js --claude --cursor --windsurf --opencode --codex
 *   node install.js --skills-only [--claude] [--cursor] ...
 *   node install.js --uninstall [--claude] ...
 *   node install.js --compile-only
 *
 * Environment overrides:
 *   AGENT_THREADER_PACKAGE_NAME    Override the package name (default: agent-threader)
 *   AGENT_THREADER_PACKAGE_VERSION Override the package version (default: latest)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, cpSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import os from "node:os";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const PROJECT_NAME = process.env.AGENT_THREADER_PACKAGE_NAME || "agent-threader";
const CLI_BIN_NAME = "agent-threader";
const MANAGED_MARKER = "managed_by: agent-threader";
const MANAGED_MARKER_RE = new RegExp(MANAGED_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
const SKILLS = ["agent-threader"];
const COMPILED_DIR = join(ROOT, "compiled");
const COMPILE_SCRIPT = join(ROOT, "skill", "build", "compile.mjs");

// ─── Directory paths ─────────────────────────────────────────────────────────

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || join(HOME, ".config");
const CODEX_HOME = process.env.CODEX_HOME || join(HOME, ".codex");

const DIRS = {
  claude:   join(HOME, ".claude", "skills"),
  cursor: {
    rules:  join(HOME, ".cursor", "rules"),
    skills: join(HOME, ".cursor", "skills"),
  },
  windsurf: {
    rules:  join(HOME, ".windsurf", "rules"),
    skills: join(HOME, ".codeium", "windsurf", "skills"),
  },
  opencode: join(APPDATA, "opencode", "agents"),
  codex:    join(CODEX_HOME, "skills"),
};

// ─── Output helpers ────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }
function info(msg) { console.log(`  ${msg}`); }
function warn(msg) { console.warn(`  WARNING: ${msg}`); }
function error(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }

// ─── Shell out helpers ─────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  log(`--> ${cmd} ${args.join(" ")}`);
  try {
    execSync(`${cmd} ${args.join(" ")}`, {
      cwd: opts.cwd || ROOT,
      stdio: "inherit",
      ...opts,
    });
    return true;
  } catch (e) {
    if (opts.ignoreErrors) {
      warn(`${cmd} exited with non-zero; continuing`);
      return false;
    }
    error(`${cmd} failed. Check output above.`);
    return false; // unreachable
  }
}

function npmPrefixGlobal() {
  return execSync("npm prefix -g", { encoding: "utf8" }).trim();
}

function hasSourceBuild() {
  return existsSync(join(ROOT, "src")) && existsSync(COMPILE_SCRIPT);
}

function hasCompiledArtifacts() {
  return existsSync(join(COMPILED_DIR, "claude", "agent-threader", "SKILL.md")) &&
    existsSync(join(COMPILED_DIR, "cursor", "rules", "agent-threader.mdc")) &&
    existsSync(join(COMPILED_DIR, "cursor", "skills", "agent-threader", "SKILL.md")) &&
    existsSync(join(COMPILED_DIR, "windsurf", "rules", "agent-threader.md")) &&
    existsSync(join(COMPILED_DIR, "windsurf", "skills", "agent-threader", "SKILL.md")) &&
    existsSync(join(COMPILED_DIR, "opencode", "agent-threader.md")) &&
    existsSync(join(COMPILED_DIR, "codex", "agent-threader", "SKILL.md"));
}

// ─── Auto-detection ───────────────────────────────────────────────────────────

function detectTargets() {
  const detected = [];
  if (existsSync(join(HOME, ".claude"))) detected.push("claude");
  if (existsSync(join(HOME, ".cursor"))) detected.push("cursor");
  if (existsSync(join(HOME, ".windsurf")) || existsSync(join(HOME, ".codeium", "windsurf"))) detected.push("windsurf");
  if (existsSync(join(APPDATA, "opencode")) || existsSync(join(HOME, ".opencode"))) detected.push("opencode");
  if (process.env.CODEX_HOME || existsSync(CODEX_HOME)) detected.push("codex");
  return detected;
}

// ─── File operations ───────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Remove stale files written by this project (identified by MANAGED_MARKER)
 * and clean up empty parent directories.
 */
function cleanupManaged(dir) {
  if (!existsSync(dir)) return;

  const files = readdirSync(dir, { recursive: true });
  let removed = 0;

  for (const file of files) {
    const fullPath = join(dir, file);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }
    if (!stat.isFile()) continue;

    let content;
    try { content = readFileSync(fullPath, "utf8"); } catch { continue; }
    if (!content.includes(MANAGED_MARKER)) continue;

    rmSync(fullPath);
    removed++;
    log(`    Removed: ${relative(dir, fullPath)}`);

    // Try to remove empty parent directories up to `dir`
    let parent = dirname(fullPath);
    while (parent !== dir && parent !== ".") {
      try {
        const entries = readdirSync(parent);
        if (entries.length === 0) {
          rmSync(parent, { recursive: true });
          log(`    Removed empty dir: ${relative(dir, parent)}`);
          parent = dirname(parent);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }
}

/**
 * Remove all skill files for this project from a target directory.
 * Handles both direct file removal and recursive directory removal.
 */
function uninstallFrom(target, skill) {
  switch (target) {
    case "claude":
      rmSync(join(DIRS.claude, skill), { recursive: true, force: true });
      info(`${target}: removed`);
      break;
    case "cursor":
      rmSync(join(DIRS.cursor.rules, `${skill}.mdc`), { force: true });
      rmSync(join(DIRS.cursor.skills, skill), { recursive: true, force: true });
      info(`${target}: removed`);
      break;
    case "windsurf":
      rmSync(join(DIRS.windsurf.rules, `${skill}.md`), { force: true });
      rmSync(join(DIRS.windsurf.skills, skill), { recursive: true, force: true });
      info(`${target}: removed`);
      break;
    case "opencode":
      rmSync(join(DIRS.opencode, `${skill}.md`), { force: true });
      info(`${target}: removed`);
      break;
    case "codex":
      rmSync(join(DIRS.codex, skill), { recursive: true, force: true });
      info(`${target}: removed`);
      break;
  }
}

// ─── Skill installation ────────────────────────────────────────────────────────

function installSkill(target, skill) {
  switch (target) {
    case "claude": {
      const dest = join(DIRS.claude, skill);
      ensureDir(dest);
      cpSync(join(COMPILED_DIR, "claude", skill, "SKILL.md"), join(dest, "SKILL.md"));
      info(`${target}: ${join(dest, "SKILL.md")}`);
      break;
    }
    case "cursor": {
      ensureDir(DIRS.cursor.rules);
      const destDir = join(DIRS.cursor.skills, skill);
      ensureDir(destDir);
      cpSync(join(COMPILED_DIR, "cursor", "rules", `${skill}.mdc`), join(DIRS.cursor.rules, `${skill}.mdc`));
      cpSync(join(COMPILED_DIR, "cursor", "skills", skill, "SKILL.md"), join(destDir, "SKILL.md"));
      info(`${target}: ${join(DIRS.cursor.rules, `${skill}.mdc`)}`);
      info(`${target} (skill): ${join(destDir, "SKILL.md")}`);
      break;
    }
    case "windsurf": {
      ensureDir(DIRS.windsurf.rules);
      const destDir = join(DIRS.windsurf.skills, skill);
      ensureDir(destDir);
      cpSync(join(COMPILED_DIR, "windsurf", "rules", `${skill}.md`), join(DIRS.windsurf.rules, `${skill}.md`));
      cpSync(join(COMPILED_DIR, "windsurf", "skills", skill, "SKILL.md"), join(destDir, "SKILL.md"));
      info(`${target}: ${join(DIRS.windsurf.rules, `${skill}.md`)}`);
      info(`${target} (skill): ${join(destDir, "SKILL.md")}`);
      break;
    }
    case "opencode": {
      ensureDir(DIRS.opencode);
      cpSync(join(COMPILED_DIR, "opencode", `${skill}.md`), join(DIRS.opencode, `${skill}.md`));
      info(`${target}: ${join(DIRS.opencode, `${skill}.md`)}`);
      break;
    }
    case "codex": {
      const destDir = join(DIRS.codex, skill);
      ensureDir(destDir);
      cpSync(join(COMPILED_DIR, "codex", skill, "SKILL.md"), join(destDir, "SKILL.md"));
      info(`${target}: ${join(destDir, "SKILL.md")}`);
      break;
    }
  }
}

// ─── Main logic ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  // ── Parse flags ────────────────────────────────────────────────────────────
  const targets = [];
  let doBuild = true;
  let doUninstall = false;
  let doCompileOnly = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--claude":   targets.push("claude");   break;
      case "--cursor":   targets.push("cursor");   break;
      case "--windsurf": targets.push("windsurf"); break;
      case "--opencode": targets.push("opencode"); break;
      case "--codex":    targets.push("codex");    break;
      case "--all":
        targets.push("claude", "cursor", "windsurf", "opencode", "codex");
        break;
      case "--skills-only": doBuild = false; break;
      case "--uninstall":   doUninstall = true; break;
      case "--compile-only": doCompileOnly = true; break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        error(`Unknown option: ${args[i]}\nRun: node install.js --help`);
    }
  }

  if (doCompileOnly) {
    if (!hasSourceBuild()) {
      if (hasCompiledArtifacts()) {
        log("==> Compiled release artifacts already present.");
        log("Use the dev branch to rebuild generated skill artifacts.");
        return;
      }
      error("No source compiler or compiled release artifacts found.");
    }
    log("==> Compiling skills...");
    run("node", [COMPILE_SCRIPT]);
    log("==> Done.");
    return;
  }

  if (targets.length === 0) {
    const detected = detectTargets();
    if (detected.length > 0) {
      log(`==> Auto-detected targets: ${detected.join(", ")}`);
      targets.push(...detected);
    }
  }

  if (targets.length === 0) {
    error(
      "No supported tools detected. Use --claude, --cursor, --windsurf, --opencode, or --codex."
    );
  }

  // ── Uninstall path ──────────────────────────────────────────────────────────
  if (doUninstall) {
    log(`==> Uninstalling ${PROJECT_NAME}`);
    log(`    Targets: ${targets.join(", ")}`);
    log("");

    for (const target of targets) {
      for (const skill of SKILLS) {
        uninstallFrom(target, skill);
      }
    }

    log("");
    log("--> Removing CLI from global path...");
    try {
      execSync(`npm unlink ${PROJECT_NAME}`, { stdio: "pipe" });
    } catch {
      // unlink fails gracefully if not linked
    }

    const cliPath = join(npmPrefixGlobal(), "bin", CLI_BIN_NAME);
    if (existsSync(cliPath) || existsSync(`${cliPath}.cmd`)) {
      warn(`${CLI_BIN_NAME} still present in global npm bin. Run 'npm unlink ${PROJECT_NAME}' manually.`);
    } else {
      info(`${CLI_BIN_NAME} removed from global npm bin`);
    }

    log("");
    log("==> Done. Skills and CLI removed.");
    return;
  }

  // ── Install path ────────────────────────────────────────────────────────────
  log(`==> ${PROJECT_NAME} setup`);
  info(`Project: ${ROOT}`);
  info(`Targets: ${targets.join(", ")}`);
  log("");

  if (doBuild && !hasSourceBuild()) {
    if (!hasCompiledArtifacts()) {
      error("No source build files or compiled release artifacts found.");
    }
    log("--> Static release artifacts found; skipping source build and npm link.");
    log("    Use the dev branch to rebuild generated skill artifacts.");
    doBuild = false;
  }

  let cliInstalled = false;

  if (doBuild) {
    // Verify Node.js and npm are available
    try {
      execSync("npm --version", { stdio: "pipe" });
    } catch {
      error("npm is required but was not found in PATH.");
    }

    log("--> Installing dependencies...");
    run("npm", ["install"]);

    log("--> Cleaning previous build...");
    try { rmSync(join(ROOT, "dist"), { recursive: true, force: true }); } catch { /* ignore */ }

    log("--> Building TypeScript...");
    run("npm", ["run", "build"]);

    log("--> Compiling skills...");
    run("node", ["skill/build/compile.mjs"]);

    log(`--> Installing ${CLI_BIN_NAME} CLI globally...`);
    run("npm", ["link"]);

    const npmBin = join(npmPrefixGlobal(), "bin");
    const binExists =
      existsSync(join(npmBin, CLI_BIN_NAME)) ||
      existsSync(join(npmBin, `${CLI_BIN_NAME}.cmd`)) ||
      existsSync(join(npmBin, `${CLI_BIN_NAME}.ps1`));

    if (binExists) {
      cliInstalled = true;
      info(`${CLI_BIN_NAME}: ${join(npmBin, CLI_BIN_NAME)}`);
      try {
        const version = execSync(`${join(npmBin, CLI_BIN_NAME)} --version`, { encoding: "utf8" }).trim();
        info(`version: ${version}`);
      } catch {
        info("version: unknown (could not run)");
      }
    } else {
      warn(`${CLI_BIN_NAME} not found in ${npmBin} after npm link.`);
      info("Try running: npm link");
    }
  }

  log(`--> Cleaning stale ${PROJECT_NAME} files...`);
  for (const target of targets) {
    switch (target) {
      case "claude":   cleanupManaged(DIRS.claude);   break;
      case "cursor":
        cleanupManaged(DIRS.cursor.rules);
        cleanupManaged(DIRS.cursor.skills);
        break;
      case "windsurf":
        cleanupManaged(DIRS.windsurf.rules);
        cleanupManaged(DIRS.windsurf.skills);
        break;
      case "opencode": cleanupManaged(DIRS.opencode); break;
      case "codex":    cleanupManaged(DIRS.codex);    break;
    }
  }

  log("--> Installing skills...");
  for (const skill of SKILLS) {
    log(`  ${skill}:`);
    for (const target of targets) {
      installSkill(target, skill);
    }
  }

  log("");
  log("==> Done.");
  log("");
  log(`Skills installed for: ${targets.join(", ")}`);
  if (cliInstalled) {
    log(`CLI available as: ${CLI_BIN_NAME}`);
  } else {
    log(`CLI available through the published npm package: npx --yes ${PROJECT_NAME}@latest --help`);
  }
}

function printHelp() {
  console.log(`Usage: node install.js [options]
Options:
  --claude        Install skills for Claude Code
  --cursor        Install skills for Cursor
  --windsurf      Install skills for Windsurf
  --opencode      Install skills for OpenCode
  --codex         Install skills for Codex
  --all           Install for all five tools
  --skills-only   Skip npm install/build/link (just copy skills)
  --uninstall     Remove installed skills from target tools
  --compile-only  Generate compiled/ output directory on dev; validate artifacts on static main
  --help, -h      Show this help

No flags = auto-detect installed tools.
Environment: AGENT_THREADER_PACKAGE_NAME, AGENT_THREADER_PACKAGE_VERSION`);
}

main();