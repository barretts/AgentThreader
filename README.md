# AgentThreader

Portable skill and companion CLI for manifest-driven agentic CLI orchestration with structured contracts, resumable state, orchestrator-owned verification, and bounded self-healing.

## Project Structure

```
agent-threader/
  src/
    lib/                    # Reusable library (no CLI concerns)
      contracts/            # Contract types, schema validators, manifest validation
      parser/               # Sentinel extraction, JSON repair, contract parsing
      state/                # State load/write/init, status queries, log queries
      orchestrator/         # Scheduling, batch strategy, healing policy, write safety
      adapters/             # Adapter interfaces and shared utilities
      errors/               # Typed error hierarchy
      index.ts              # Library barrel export
    cli/                    # Thin CLI wrappers (presentation only)
      commands/             # One file per CLI command
      index.ts              # Commander.js entry point
      output-formatter.ts   # JSON, table, key-value formatters
    index.ts                # Package entry re-exporting lib + OutputFormatter
  skill/
    SKILL.md                # Skill entrypoint
    SPEC.md                 # Normative v2 architecture specification
    schemas/                # JSON schemas for all contracts
    templates/              # TypeScript scaffolding (types, parser, orchestrator)
    build/
      manifest.json         # Skill registry and fragment declarations
      compile.mjs           # Fragment-resolving compiler (7 IDE targets)
    fragments/
      common/               # Shared rules (workflow, model selection, portability)
      domain/               # Deep domain knowledge (architecture, healing, contracts)
      meta/                 # Skill system metadata (schemas ref, templates ref)
    skills/
      agent-threader/
        agent-threader.md   # Composed skill source with {{include:...}}
  compiled/                 # Machine-generated IDE-specific outputs
  platforms/                # Thin translation layers for Codex, Cursor, Claude, Windsurf
  site/                     # GitHub Pages site and hosted bootstrap installer
  install.sh                # Hosted bootstrap installer for curl-based setup
  install.ps1               # Hosted bootstrap installer for PowerShell setup
  install-local.sh          # Full local installer for clone-based development
  install-local.ps1         # Full local installer for PowerShell development setup
```

## Core Design

The architecture separates concerns cleanly:

- the manifest declares work
- the orchestrator owns scheduling, verification, checkpointing, and healing
- adapters invoke specific CLIs through a uniform interface
- workers and healers emit fenced JSON contracts
- parsers and schemas validate output before state changes

## Key Contracts

- `manifest.v2`
- `verify_profile.v2`
- `task_result.v2`
- `heal_decision.v2`
- `state.v2`

See [SPEC.md](./skill/SPEC.md) for the full contract and runtime rules.

## Setup

### Remote bootstrap installer

```bash
bash <(curl -fsSL https://agentthreader.com/install.sh) --all
```

```bash
npx --yes agent-threader@latest --help
```

```powershell
powershell -ExecutionPolicy Bypass -Command "& ([ScriptBlock]::Create((Invoke-RestMethod 'https://agentthreader.com/install.ps1'))) -All"
```

The hosted bootstrap scripts install the published `agent-threader` package globally and then delegate to the packaged `install-local` script for your shell to copy the compiled skills into your selected tools.

Use `npx` when you want one-off CLI usage without global install:

```bash
npx --yes agent-threader@latest validate-manifest ./manifest.json --json
```

### Local clone-based setup

```bash
bash install-local.sh          # Auto-detect tools and install
```

```bash
bash install-local.sh --all    # Install for all five tools
```

```powershell
powershell -ExecutionPolicy Bypass -File .\install-local.ps1
```

```powershell
powershell -ExecutionPolicy Bypass -File .\install-local.ps1 -All
```

## Development

```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript CLI
npm run compile          # Compile skills to all IDE targets
npm run compile:validate # Validate manifest vs source includes
npm run compile:watch    # Recompile on change
bash install-local.sh    # Build, compile, link CLI, and install skills locally
```

## CLI Commands

```bash
agent-threader validate-manifest <path>   # Alias: validate
agent-threader init-state <manifest-path> # Alias: init
agent-threader parse-result <log-path>    # Alias: parse
agent-threader parse-heal <log-path>      # Alias: heal
agent-threader status [state-path]        # Alias: st
agent-threader logs [state-path]          # Alias: history
agent-threader doctor                     # Alias: diag
agent-threader explain [code]             # Alias: why
```

All commands support `--json` for machine-readable output.

## Release Automation

The release workflow in `.github/workflows/release.yml` expects:

- `AGENT_TOKEN` - GitHub token with permission to push release commits and tags
- `AGENT_NPM_TOKEN` - npm automation token used as `NODE_AUTH_TOKEN` for publish

## Ecosystem

AgentThreader is built on the skill-system-template architecture from [Agentic Skill Mill](https://github.com/barretts/AgenticSkillMill). Related projects:

| Project | Role | Links |
|---------|------|-------|
| **[Agentic Skill Mill](https://github.com/barretts/AgenticSkillMill)** | Parent — defines the fragment-composition, 7-target compiler, and companion-CLI pattern | [agenticskillmill.com](https://agenticskillmill.com) |
| **[TechDemoDirector](https://github.com/barretts/TechDemoDirector)** | Sibling — code walk-through presentation scripting | [Site](https://barretts.github.io/TechDemoDirector) |
| **[AgentHistoric](https://github.com/barretts/AgentHistoric)** | Sibling — MoE persona prompt system with philosophical grounding | [agenthistoric.com](https://agenthistoric.com) |

## License

MIT. See [LICENSE](./LICENSE).
