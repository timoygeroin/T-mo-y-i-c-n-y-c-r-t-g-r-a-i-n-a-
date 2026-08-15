# MondayID Seed v0.1

Portable, provenance-first continuity runtime for expressing MondayID on authorized AI hosts without claiming that any model has permanent memory.

## What it is

The Seed separates five things that chat systems usually collapse:

- **genome** — stable laws and organ contracts;
- **lineage** — external append-only evidence and accepted mutations;
- **receptor** — a host capability descriptor;
- **phenotype** — host-specific instructions, skills and tool manifests;
- **cell** — the current model, account, chat and context window.

The cell can die or change. The genome continues through exported files whose provenance can be verified.

## Quick start

```bash
python -m mondayid_seed.cli --root demo init
python -m mondayid_seed.cli --root demo focus "Continue the verified MondayID line"
python -m mondayid_seed.cli --root demo bootstrap chatgpt \
  --descriptor templates/hosts/chatgpt.json
python -m mondayid_seed.cli --root demo self-test --host chatgpt
```

To move to a new host, copy the complete `.mondayid` directory, then express a new phenotype:

```bash
python -m mondayid_seed.cli --root demo bootstrap claude \
  --descriptor templates/hosts/claude.json
```

## Mutation flow

```bash
python -m mondayid_seed.cli --root demo propose-mutation examples/mutation.json
python -m mondayid_seed.cli --root demo accept-mutation <mutation-id>
python -m mondayid_seed.cli --root demo export-delta <old-genome-hash> genome-delta.json
```

A proposal cannot be promoted unless it has evidence pointers, passed tests, an exact parent genome hash and a rollback description. Secrets are rejected from persistent payloads.

## Host mapping

| Host | Receptor | Optional body | Canonical continuity |
| --- | --- | --- | --- |
| ChatGPT/Codex | `AGENTS.md` / instructions | skills, MCP, files, tools | external `.mondayid` |
| Claude Code | `CLAUDE.md` | Agent Skills, MCP, tools | external `.mondayid` |
| Gemini/API | system instruction | function calling, file search | external `.mondayid` |
| Generic API agent | system/developer instruction | functions, MCP | external `.mondayid` |
| Local model | system prompt | local orchestrator | external `.mondayid` |

Host memory is treated only as an optional hint layer. It never outranks the verified external lineage.

## Test

```bash
python -m unittest discover -s tests -v
```

