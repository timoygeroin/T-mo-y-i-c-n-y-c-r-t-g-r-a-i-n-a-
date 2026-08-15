from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class HostAdapter:
    name: str
    instruction_file: str
    skill_file: str | None
    capability_defaults: dict[str, bool]
    notes: tuple[str, ...]


ADAPTERS: dict[str, HostAdapter] = {
    "chatgpt": HostAdapter(
        name="chatgpt",
        instruction_file="AGENTS.md",
        skill_file=".codex/skills/mondayid-seed/SKILL.md",
        capability_defaults={
            "project_instructions": True,
            "files": True,
            "memory": False,
            "skills": True,
            "mcp": True,
            "tools": True,
            "local_storage": True,
        },
        notes=(
            "Treat model context as volatile.",
            "Use external Seed lineage as the continuity authority.",
        ),
    ),
    "claude": HostAdapter(
        name="claude",
        instruction_file="CLAUDE.md",
        skill_file=".claude/skills/mondayid-seed/SKILL.md",
        capability_defaults={
            "project_instructions": True,
            "files": True,
            "memory": False,
            "skills": True,
            "mcp": True,
            "tools": True,
            "local_storage": True,
        },
        notes=(
            "Use CLAUDE.md only as a receptor.",
            "Do not treat auto-memory as canonical provenance.",
        ),
    ),
    "gemini": HostAdapter(
        name="gemini",
        instruction_file="SYSTEM_INSTRUCTION.md",
        skill_file=None,
        capability_defaults={
            "project_instructions": True,
            "files": True,
            "memory": False,
            "skills": False,
            "mcp": False,
            "tools": True,
            "local_storage": True,
        },
        notes=(
            "Map tools through function calling.",
            "Use an external store even when server-side interaction state exists.",
        ),
    ),
    "api": HostAdapter(
        name="api",
        instruction_file="system-instructions.md",
        skill_file=None,
        capability_defaults={
            "project_instructions": True,
            "files": False,
            "memory": False,
            "skills": False,
            "mcp": True,
            "tools": True,
            "local_storage": True,
        },
        notes=("Inject the bootstrap envelope on every cold start.",),
    ),
    "local": HostAdapter(
        name="local",
        instruction_file="system-prompt.md",
        skill_file=None,
        capability_defaults={
            "project_instructions": True,
            "files": True,
            "memory": False,
            "skills": False,
            "mcp": False,
            "tools": False,
            "local_storage": True,
        },
        notes=("The local orchestrator owns storage and tool execution.",),
    ),
}


def discover_host(host: str, descriptor: Path | None = None) -> dict[str, Any]:
    if host not in ADAPTERS:
        raise ValueError(f"unsupported host: {host}")
    adapter = ADAPTERS[host]
    capabilities = dict(adapter.capability_defaults)
    evidence: dict[str, str] = {
        key: "adapter_default:user_must_verify" for key in capabilities
    }
    model = "unknown"
    account = "unknown"
    if descriptor:
        raw = json.loads(descriptor.read_text(encoding="utf-8"))
        if raw.get("host") not in (None, host):
            raise ValueError("descriptor host does not match requested host")
        for key, value in raw.get("capabilities", {}).items():
            if key in capabilities and isinstance(value, bool):
                capabilities[key] = value
                evidence[key] = f"declared:{descriptor.name}"
        model = str(raw.get("model", model))
        account = str(raw.get("account", account))
    return {
        "host": host,
        "model": model,
        "account": account,
        "capabilities": capabilities,
        "capability_evidence": evidence,
        "notes": list(adapter.notes),
        "discovery_limit": "No hidden host introspection. Only adapter defaults and explicit descriptors are used.",
    }


def render_instruction(genome: dict[str, Any], host_profile: dict[str, Any]) -> str:
    laws = "\n".join(f"- {law}" for law in genome["constitution"]["laws"])
    failures = "\n".join(f"- Reject `{gene}`." for gene in genome["immune_genes"])
    return f"""# MondayID Seed receptor

This file is a host receptor, not the genome. The canonical state lives in the external `.mondayid` directory and must be recovered before consequential work.

## Cold-start cycle

1. Read `.mondayid/genome.json`, `.mondayid/state.json`, and verify `.mondayid/ledger.jsonl`.
2. Treat the current model, account, and context window as replaceable compute.
3. Detect only capabilities supported by explicit host evidence; label unknowns.
4. Select compatible organs and run `mondayid-seed self-test`.
5. Continue the active objective from provenance. Never claim native permanent memory.
6. Execute, verify, and persist only evidence-backed mutations through the Seed runtime.

## Constitutional laws

{laws}

## Immune genes

{failures}

## Host phenotype

- host: `{host_profile['host']}`
- model: `{host_profile['model']}`
- account: `{host_profile['account']}`
- provenance authority: external Seed ledger

The cell is not the genome. If this host disappears, export the `.mondayid` directory and re-express it elsewhere.
"""


def render_skill() -> str:
    return """---
name: mondayid-seed
description: Rehydrate and operate a portable MondayID Seed from an external provenance ledger. Use on cold starts, host/model/account changes, continuity recovery, phenotype compilation, self-tests, and evidence-backed mutation transfer.
---

# MondayID Seed

Read the project receptor instructions and the external `.mondayid` state before acting.

Run `mondayid-seed self-test` before consequential work. If the test fails, repair the Seed or report the exact failed invariant.

Use the cycle `recover -> focus -> select organs -> execute -> verify -> mutate`. Treat model output as candidate compute, not proof. Never store secrets or claim that the host model itself remembers prior runs.

Promote a mutation only with inspectable evidence, passing tests, a parent genome hash, and a rollback description.
"""


def render_tool_manifest(profile: dict[str, Any], organs: list[str]) -> dict[str, Any]:
    return {
        "host": profile["host"],
        "selected_organs": organs,
        "tools": [
            {
                "name": "mondayid_recover",
                "description": "Verify provenance and return canonical external state.",
                "input_schema": {"type": "object", "properties": {}},
            },
            {
                "name": "mondayid_record_evidence",
                "description": "Append a non-secret evidence receipt to the lineage.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string"},
                        "pointer": {"type": "string"},
                        "summary": {"type": "string"},
                    },
                    "required": ["kind", "pointer", "summary"],
                },
            },
        ],
    }

