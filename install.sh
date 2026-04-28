#!/usr/bin/env bash
# install.sh -- Bootstrap installer for the published agent-threader package
# Usage: bash <(curl -fsSL https://agentthreader.com/install.sh) [--claude] [--cursor] [--windsurf] [--opencode] [--codex] [--all]
#
# Bootstrap process:
#   1. Install the npm package globally
#   2. Delegate to install.js (Node.js, cross-platform) for skill installation

set -euo pipefail

PROJECT_NAME="${AGENT_THREADER_PACKAGE_NAME:-agent-threader}"
PROJECT_VERSION="${AGENT_THREADER_PACKAGE_VERSION:-latest}"
CLI_BIN_NAME="agent-threader"
PACKAGE_SPEC="${PROJECT_NAME}@${PROJECT_VERSION}"
INSTALLER_ARGS=("$@")

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is required but was not found in PATH."
  exit 1
fi

echo "==> Bootstrapping ${PACKAGE_SPEC}"
echo "--> Installing ${PACKAGE_SPEC} globally..."
npm install -g "$PACKAGE_SPEC"

NPM_ROOT="$(npm root -g)"
PACKAGE_DIR="$NPM_ROOT/$PROJECT_NAME"
LOCAL_INSTALLER="$PACKAGE_DIR/install.js"

if [[ ! -f "$LOCAL_INSTALLER" ]]; then
  echo "ERROR: Could not find install.js in $PACKAGE_DIR"
  exit 1
fi

echo "--> Delegating to Node.js installer..."
node "$LOCAL_INSTALLER" --skills-only "${INSTALLER_ARGS[@]}"

echo ""
echo "==> Done."
echo "CLI available as: $CLI_BIN_NAME"