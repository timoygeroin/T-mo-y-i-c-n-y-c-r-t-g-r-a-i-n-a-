# MondayID Worldline v4 · executable build

**This is an integration into the EXISTING MondayID runtime, not a new Monday clone or UI.**

- `src/worldline-v4-server.mjs`: authenticated append-only durable HTTP Worldline server. Reader/writer credentials are separate; GET reopens disk. Same event ID with conflicting contents is rejected, repeat writes are idempotent.
- `src/trusted-worldline-receptor.mjs`: exact action-linked external write with required verified evidenceRef.
- `src/trusted-host-reader.mjs`: second authorized read made by a host-supplied verifier, checking action ID, source, domain, creator and writer attribution.
- `src/transfer-harness.mjs`: injects that verifier into `MondayRuntime`, so self-attestation is not a passing result.
- `src/worldline-receive.mjs`: independent receiving process reconstructs evidence from the remote journal.

To start the reference server (Node 22+, a mounted **persistent** writable volume):

```bash
export MONDAYID_WORLDLINE_FILE="$PWD/.private/worldline.jsonl"
export MONDAYID_WORLDLINE_WRITER_TOKEN='<long random writer secret>'
export MONDAYID_WORLDLINE_READ_TOKEN='<different long random reader secret>'
# Default binds only 127.0.0.1; expose behind TLS/reverse proxy if required.
npm run worldline:serve
```

In a **separate process**, run the action (do not commit tokens to Git):

```bash
export MONDAYID_WORLDLINE_URL='http://127.0.0.1:7777'
# same writer token and read-only token are loaded by the host environment
export MONDAYID_PROOF_SIGNAL_ID='first-mondayid-real-handoff'
npm run transfer:proof
```

In a **third process** with **only** the reader credential, prove inheritance:

```bash
export MONDAYID_WORLDLINE_URL='http://127.0.0.1:7777'
export MONDAYID_WORLDLINE_READ_TOKEN='<read token only>'
export MONDAYID_PROOF_SIGNAL_ID='first-mondayid-real-handoff'
npm run transfer:receive
```

For any real external buyer workflow, the business action's own state must be checked by a separate domain-specific verifier before generating `verified_external_effect`. This transport verifies **the persistence and provenance of an event**, not whether an email was actually sent, a payment was received, or a deal was signed.

**Safety and delivery limits:** Reference server is a single-process/file-based transport, not a globally replicated database. Mount a durable volume, back it up, place behind TLS and proper network access control before exposure to other devices. Dedicated production datastore, access revocation, secrets rotation and multi-instance coordination need independent acceptance. The cross-host test using separate local processes is not proof of WAN/public deployment or connected third-party AI systems.