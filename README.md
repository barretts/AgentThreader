# AgentThreader

AgentThreader is a portable skill and companion CLI for manifest-driven agentic CLI orchestration with structured contracts, resumable state, orchestrator-owned verification, and bounded self-healing.

This `main` branch is the stable static release branch. Source development now happens on `dev`.

## Install

Remote bootstrap installers are served from GitHub Pages:

```bash
bash <(curl -fsSL https://agentthreader.com/install.sh) --all
```

```powershell
powershell -ExecutionPolicy Bypass -Command "& ([ScriptBlock]::Create((Invoke-RestMethod 'https://agentthreader.com/install.ps1'))) -All"
```

Use `npx` when you want one-off CLI usage without global install:

```bash
npx --yes agent-threader@latest validate-manifest ./manifest.json --json
```

## Local Static Install

```bash
node install.js --all
```

Static `main` installs prebuilt release artifacts from `compiled/`. Use the `dev` branch to rebuild generated skill artifacts or change source code.

## Supported Targets

| Flag | Target |
|------|--------|
| `--claude` | Claude Code skills |
| `--cursor` | Cursor rules and skills |
| `--windsurf` | Windsurf rules and skills |
| `--opencode` | OpenCode agent |
| `--codex` | Codex skill |
| `--all` | All targets |

If no target flags are provided, the installer auto-detects installed tools.

## Branches

- **`main`:** stable static release branch with `compiled/`, installers, package metadata, public docs, and the static website.
- **`dev`:** canonical source branch with `src/`, `skill/`, `platforms/`, `boilerplate/`, tests, and build configuration.

To modify the CLI, library, skill compiler, prompts, tests, or website source, branch from `dev`.

## Included Release Artifacts

- `compiled/claude/agent-threader/SKILL.md`
- `compiled/codex/agent-threader/SKILL.md`
- `compiled/cursor/rules/agent-threader.mdc`
- `compiled/cursor/skills/agent-threader/SKILL.md`
- `compiled/opencode/agent-threader.md`
- `compiled/output/agent-threader/SKILL.md`
- `compiled/windsurf/rules/agent-threader.md`
- `compiled/windsurf/skills/agent-threader/SKILL.md`
- `site/`
- `install.js`
- `install.sh`
- `install.ps1`

## Release Automation

Npm deployment automation is disabled for now. Re-enable it only through a separate explicit release plan.

## Website

The static website is deployed from the tracked `site/` directory on `main`.

Public install wrappers are also copied into:

- `site/install.sh`
- `site/install.ps1`

## License

MIT. See [LICENSE](./LICENSE).
