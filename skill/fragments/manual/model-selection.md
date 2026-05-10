### Model Selection Rule

When the user requests a self-healing runner, ask which model surfaces to use before generating the runner:

- **Worker model surface** -- performs each task and can be fast or cheap.
- **Healer model surface** -- diagnoses failures and should be more capable.

If the user does not specify, state the defaults explicitly before proceeding:

- Worker: the currently available model surface.
- Healer: the strongest available model surface in the same environment.
