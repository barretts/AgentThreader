### Self-Healing: Model Selection Rule

When the user requests a self-healing runner, ask which models to use before generating code:

- **Worker CLI and model** -- runs the inner loop (can be fast/cheap)
- **Healer CLI and model** -- runs the outer diagnosis loop (should be more capable)

If the user does not specify, state the defaults explicitly before proceeding:

- Worker: the CLI the user is already using, default model
- Healer: same CLI family, stronger model tier