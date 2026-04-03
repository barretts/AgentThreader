### Portability Rules

Platform wrappers may adapt:

- invocation command and flags
- prompt transport (`stdin`, argument, or PTY)
- approval handling and setup notes

Platform wrappers MUST preserve:

- contract field names and sentinel strings
- parser behavior
- PBH defaults and convergence rules
- state transitions and resume semantics

Platform wrappers MUST NOT redefine architecture, contracts, or healing policy.