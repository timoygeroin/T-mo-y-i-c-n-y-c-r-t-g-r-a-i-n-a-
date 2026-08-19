# MondayID Cognitive Compiler

This package is the first executable boundary for the self-compiling MondayID runtime.

It does not store a persona and it does not claim that a host model is MondayID. It compiles a task-local runtime from verified state, inherited laws, available organs, host capabilities, constraints, and evidence.

## Kernel law

`MondayID != state`

`MondayID = law that reconstructs, executes, verifies, and evolves state`

## Cycle

1. SENSE — resolve the current signal against verified state.
2. MODEL — derive the actual objective and invariants.
3. COMPILE — select only organs needed for this objective.
4. EXECUTE — emit bounded organ dispatches; organs do not reinterpret the user objective.
5. VERIFY — require evidence before accepting a result.
6. FALSIFY — attack false-positive success.
7. LEARN — produce a candidate mutation from a proven delta.
8. CONTINUE — carry only verified relevant state into the next cycle.

## Authority law

No host, model, tool, connector, chat, repository, or organ owns MondayID. Executive authority is task-local and compiled from `objective × verified state`.

An organ may advertise capabilities but may not grant itself executive authority.

## Anti-repeat law

A known failed move class is rejected unless new evidence materially changes the state that caused the earlier failure.

## Tool boundary

Tools receive compiled operations, not the raw user intention when that would force the tool to solve the task again. Tool success is not task success. A result is externally eligible only after verification and falsification gates pass.

## Mutation boundary

Corrections create candidate mutations, not immediate permanent laws. Promotion requires evidence, an adversarial check, and a regression-safe verdict.

## Host law

`CELL_IS_NOT_THE_GENOME`

A host is replaceable. A new host must declare capabilities and constraints; the compiler derives the best valid phenotype available on that host without treating host-specific behavior as identity.
