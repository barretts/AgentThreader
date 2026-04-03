#!/usr/bin/env bash
# install.sh -- Set up skills and companion CLI for AI coding tools
# Run once from the project root: bash install.sh [--claude] [--cursor] [--windsurf] [--opencode] [--codex] [--all]
# No flags = auto-detect installed tools

set -e

# ===========================================================================
# CONFIGURE: Change these values for your project
# ===========================================================================

PROJECT_NAME="agent-threader"
CLI_BIN_NAME="agent-threader"
MANAGED_MARKER="managed_by: agent-threader"
SKILLS=("agent-threader")

# ===========================================================================
# End configuration
# ===========================================================================

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Target directories ---
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
CURSOR_RULES_DIR="$HOME/.cursor/rules"
CURSOR_SKILLS_DIR="$HOME/.cursor/skills"
WINDSURF_RULES_DIR="$HOME/.windsurf/rules"
WINDSURF_SKILLS_DIR="$HOME/.codeium/windsurf/skills"
OPENCODE_AGENTS_DIR="$HOME/.config/opencode/agents"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
CODEX_SKILLS_DIR="$CODEX_HOME_DIR/skills"

# --- Stale file cleanup (marker-based) ---

cleanup_managed() {
  local dir="$1"
  [[ -d "$dir" ]] || return
  grep -rl "$MANAGED_MARKER" "$dir" 2>/dev/null | while read -r f; do
    rm -f "$f"
    local parent; parent="$(dirname "$f")"
    [[ "$parent" != "$dir" ]] && rmdir "$parent" 2>/dev/null || true
    echo "    Removed: $f"
  done
}

# --- Install functions (copy from compiled/ output) ---

COMPILED_DIR="$SKILL_DIR/compiled"

install_claude() {
  local skill_name="$1"
  local src="$COMPILED_DIR/claude/${skill_name}/SKILL.md"
  local dest_dir="$CLAUDE_SKILLS_DIR/${skill_name}"
  mkdir -p "$dest_dir"
  cp "$src" "$dest_dir/SKILL.md"
  echo "    Claude:   $dest_dir/SKILL.md"
}

install_cursor() {
  local skill_name="$1"
  local src="$COMPILED_DIR/cursor/rules/${skill_name}.mdc"
  mkdir -p "$CURSOR_RULES_DIR"
  cp "$src" "$CURSOR_RULES_DIR/${skill_name}.mdc"
  echo "    Cursor (rule):  $CURSOR_RULES_DIR/${skill_name}.mdc"
  local src2="$COMPILED_DIR/cursor/skills/${skill_name}/SKILL.md"
  local dest_dir="$CURSOR_SKILLS_DIR/${skill_name}"
  mkdir -p "$dest_dir"
  cp "$src2" "$dest_dir/SKILL.md"
  echo "    Cursor (skill): $dest_dir/SKILL.md"
}

install_windsurf() {
  local skill_name="$1"
  local src="$COMPILED_DIR/windsurf/rules/${skill_name}.md"
  mkdir -p "$WINDSURF_RULES_DIR"
  cp "$src" "$WINDSURF_RULES_DIR/${skill_name}.md"
  echo "    Windsurf (rule):  $WINDSURF_RULES_DIR/${skill_name}.md"
  local src2="$COMPILED_DIR/windsurf/skills/${skill_name}/SKILL.md"
  local dest_dir="$WINDSURF_SKILLS_DIR/${skill_name}"
  mkdir -p "$dest_dir"
  cp "$src2" "$dest_dir/SKILL.md"
  echo "    Windsurf (skill): $dest_dir/SKILL.md"
}

install_opencode() {
  local skill_name="$1"
  local src="$COMPILED_DIR/opencode/${skill_name}.md"
  mkdir -p "$OPENCODE_AGENTS_DIR"
  cp "$src" "$OPENCODE_AGENTS_DIR/${skill_name}.md"
  echo "    OpenCode: $OPENCODE_AGENTS_DIR/${skill_name}.md"
}

install_codex() {
  local skill_name="$1"
  local src="$COMPILED_DIR/codex/${skill_name}/SKILL.md"
  local dest_dir="$CODEX_SKILLS_DIR/${skill_name}"
  mkdir -p "$dest_dir"
  cp "$src" "$dest_dir/SKILL.md"
  echo "    Codex:    $dest_dir/SKILL.md"
}

# --- Uninstall ---

uninstall_claude()   { for skill in "${SKILLS[@]}"; do rm -rf "$CLAUDE_SKILLS_DIR/$skill"; done; echo "    Claude:   removed"; }
uninstall_cursor()   { for skill in "${SKILLS[@]}"; do rm -f "$CURSOR_RULES_DIR/${skill}.mdc"; rm -rf "$CURSOR_SKILLS_DIR/$skill"; done; echo "    Cursor:   removed"; }
uninstall_windsurf() { for skill in "${SKILLS[@]}"; do rm -f "$WINDSURF_RULES_DIR/${skill}.md"; rm -rf "$WINDSURF_SKILLS_DIR/$skill"; done; echo "    Windsurf: removed"; }
uninstall_opencode() { for skill in "${SKILLS[@]}"; do rm -f "$OPENCODE_AGENTS_DIR/${skill}.md"; done; echo "    OpenCode: removed"; }
uninstall_codex()    { for skill in "${SKILLS[@]}"; do rm -rf "$CODEX_SKILLS_DIR/$skill"; done; echo "    Codex:    removed"; }

# --- Auto-detection ---

detect_editors() {
  local detected=()
  [[ -d "$HOME/.claude" ]] && detected+=("claude")
  [[ -d "$HOME/.cursor" ]] && detected+=("cursor")
  [[ -d "$HOME/.windsurf" || -d "$HOME/.codeium/windsurf" ]] && detected+=("windsurf")
  [[ -d "$HOME/.config/opencode" || -d "$HOME/.opencode" ]] && detected+=("opencode")
  [[ -n "${CODEX_HOME:-}" || -d "$CODEX_HOME_DIR" ]] && detected+=("codex")
  echo "${detected[@]}"
}

# --- CLI parsing ---

TARGETS=()
DO_BUILD=true
DO_UNINSTALL=false
DO_COMPILE_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --claude)    TARGETS+=("claude"); shift ;;
    --cursor)    TARGETS+=("cursor"); shift ;;
    --windsurf)  TARGETS+=("windsurf"); shift ;;
    --opencode)  TARGETS+=("opencode"); shift ;;
    --codex)     TARGETS+=("codex"); shift ;;
    --all)       TARGETS=("claude" "cursor" "windsurf" "opencode" "codex"); shift ;;
    --skills-only) DO_BUILD=false; shift ;;
    --uninstall) DO_UNINSTALL=true; shift ;;
    --compile-only) DO_COMPILE_ONLY=true; shift ;;
    --help|-h)
      echo "Usage: bash install.sh [options]"
      echo ""
      echo "Options:"
      echo "  --claude        Install skills for Claude Code"
      echo "  --cursor        Install skills for Cursor"
      echo "  --windsurf      Install skills for Windsurf"
      echo "  --opencode      Install skills for OpenCode"
      echo "  --codex         Install skills for Codex"
      echo "  --all           Install for all five tools"
      echo "  --skills-only   Skip npm install/build/link (just copy skills)"
      echo "  --uninstall     Remove installed skills from target tools"
      echo "  --compile-only  Generate compiled/ output directory (no install)"
      echo "  -h, --help      Show this help"
      echo ""
      echo "No flags = auto-detect installed tools."
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run: bash install.sh --help"
      exit 1
      ;;
  esac
done

# --- Compile-only path ---

if [[ "$DO_COMPILE_ONLY" == true ]]; then
  echo "==> Delegating to compile.mjs..."
  node "$SKILL_DIR/skill/build/compile.mjs"
  exit $?
fi

# Auto-detect if no targets specified
if [[ ${#TARGETS[@]} -eq 0 ]]; then
  read -ra TARGETS <<< "$(detect_editors)"
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "ERROR: No supported tools detected. Use --claude, --cursor, --windsurf, --opencode, or --codex."
  exit 1
fi

# --- Uninstall path ---

if [[ "$DO_UNINSTALL" == true ]]; then
  echo "==> Uninstalling $PROJECT_NAME"
  echo "    Targets: ${TARGETS[*]}"
  echo ""
  for target in "${TARGETS[@]}"; do
    "uninstall_${target}"
  done

  echo "--> Removing $CLI_BIN_NAME CLI..."
  npm unlink "$PROJECT_NAME" 2>/dev/null || true
  hash -r 2>/dev/null || true
  if command -v "$CLI_BIN_NAME" &>/dev/null; then
    echo "    WARNING: $CLI_BIN_NAME still in PATH at $(which "$CLI_BIN_NAME")"
  else
    echo "    $CLI_BIN_NAME removed"
  fi

  echo ""
  echo "==> Done. Skills and CLI removed."
  exit 0
fi

# --- Install path ---

echo "==> $PROJECT_NAME setup"
echo "    Project: $SKILL_DIR"
echo "    Targets: ${TARGETS[*]}"
echo ""

if [[ "$DO_BUILD" == true ]]; then
  echo "--> Installing dependencies..."
  npm install

  echo "--> Cleaning previous build..."
  rm -rf "$SKILL_DIR/dist"

  echo "--> Building TypeScript..."
  npm run build
  chmod +x "$SKILL_DIR/dist/cli/index.js"

  echo "--> Compiling skills..."
  npm run compile

  echo "--> Installing $CLI_BIN_NAME CLI globally..."
  npm link

  NPM_BIN="$(npm prefix -g)/bin"
  if [[ -x "$NPM_BIN/$CLI_BIN_NAME" ]]; then
    echo "    $CLI_BIN_NAME: $NPM_BIN/$CLI_BIN_NAME"
    echo "    version:  $("$NPM_BIN/$CLI_BIN_NAME" --version 2>/dev/null || echo 'unknown')"
  else
    echo "    WARNING: $CLI_BIN_NAME not found in $NPM_BIN after npm link."
    echo "    Try running: npm link"
  fi
fi

echo "--> Cleaning stale $PROJECT_NAME files..."
for target in "${TARGETS[@]}"; do
  case "$target" in
    claude)   cleanup_managed "$CLAUDE_SKILLS_DIR" ;;
    cursor)   cleanup_managed "$CURSOR_RULES_DIR"; cleanup_managed "$CURSOR_SKILLS_DIR" ;;
    windsurf) cleanup_managed "$WINDSURF_RULES_DIR"; cleanup_managed "$WINDSURF_SKILLS_DIR" ;;
    opencode) cleanup_managed "$OPENCODE_AGENTS_DIR" ;;
    codex)    cleanup_managed "$CODEX_SKILLS_DIR" ;;
  esac
done

echo "--> Installing skills..."
for skill in "${SKILLS[@]}"; do
  echo "  ${skill}:"
  for target in "${TARGETS[@]}"; do
    "install_${target}" "$skill"
  done
done

echo ""
echo "==> Done."
echo ""
echo "Skills installed for: ${TARGETS[*]}"
echo "CLI available as: $CLI_BIN_NAME"
