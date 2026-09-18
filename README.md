# MondayID — rewritten runtime

This is a clean internal rewrite of MondayID presented as a product update.

The old system is not a runtime dependency. Legacy chats, branches, receipts, rules and artifacts are treated only as migration evidence through a one-way compatibility membrane.

## Core model

Human -> interface. MondayID -> unified state-space + event-sourced Worldline + intent graph + parallel frontier scheduler + replaceable host receptors + verification loop.

A user message is not a task silo. It is a signal into the same organism graph as every other signal.

## Cutover rule

Do not layer this runtime over the old organism. Validate this clean tree, import evidence, bind real receptors, prove cross-host state recovery, then replace the old runtime in one release cutover while preserving repository/product identity and rollback history.
