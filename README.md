# AgentThreader

Portable skill and companion CLI for manifest-driven agentic CLI orchestration with structured contracts, resumable state, orchestrator-owned verification, and bounded self-healing.

## Project Structure

```
agent-threader/
  skill/
    SKILL.md              # Original monolithic skill (preserved)
    SPEC.md               # Normative v2 architecture specification
    schemas/              # JSON schemas for all contracts
    templates/            # TypeScript scaffolding (types, parser, orchestrator)
    build/
      manifest.json       # Skill registry and fragment declarations
      compile.mjs         # Fragment-resolving compiler (7 IDE targets)
    fragments/
      common/             # Shared rules (workflow, model selection, portability)
      domain/             # Deep domain knowledge (architecture, healing, contracts)
      meta/               # Skill system metadata (schemas ref, templates ref)
    skills/
      agent-threader/
        agent-threader.md   # Composed skill source with {{include:...}}
  src/                    # Companion CLI (TypeScript)
  compiled/               # Machine-generated IDE-specific outputs
  platforms/              # Thin translation layers for Codex, Cursor, Claude, Windsurf
  install.sh              # One-command setup for all supported tools
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

```bash
bash install.sh          # Auto-detect tools and install
bash install.sh --all    # Install for all five tools
bash install.sh --cursor # Install for Cursor only
```

## Development

```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript CLI
npm run compile          # Compile skills to all IDE targets
npm run compile:validate # Validate manifest vs source includes
npm run compile:watch    # Recompile on change
```

## CLI Commands

```bash
agent-threader validate-manifest <path>   # Validate a manifest.v2 file
agent-threader init-state <manifest-path> # Initialize state from manifest
agent-threader parse-result <log-path>    # Extract task_result.v2 from worker log
agent-threader parse-heal <log-path>      # Extract heal_decision.v2 from healer log
agent-threader status [state-path]        # Display run status
agent-threader logs [state-path]          # List log files from state history
```

All commands support `--json` for machine-readable output.

## License

MIT. See [LICENSE](./LICENSE).
