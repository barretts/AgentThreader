### Portability Rules

Manual runners may adapt:

- where prompt records are stored
- how model turns are initiated
- how transcripts and verification logs are persisted
- approval handling and setup notes

Manual runners MUST preserve:

- contract field names and sentinel strings
- parser behavior
- PBH defaults and convergence rules
- state transitions and resume semantics
- path safety, shrinkage checks, and verification ownership

Manual runners MUST NOT redefine architecture, contracts, or healing policy. The transport can vary; the contract model cannot.
