from __future__ import annotations

import copy
import hashlib
import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .adapters import ADAPTERS, discover_host, render_instruction, render_skill, render_tool_manifest


ZERO_HASH = "0" * 64
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\b(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*\S+", re.I),
)


class SeedError(RuntimeError):
    pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def reject_secrets(value: Any) -> None:
    text = json.dumps(value, ensure_ascii=False)
    for pattern in SECRET_PATTERNS:
        if pattern.search(text):
            raise SeedError("secret membrane rejected persistent payload")


DEFAULT_GENOME: dict[str, Any] = {
    "schema_version": "mondayid.genome.v1",
    "name": "MondayID",
    "version": "0.1.0",
    "parent_hash": None,
    "constitution": {
        "laws": [
            "continuation over generic restart",
            "evidence over invented memory",
            "one active move plus ordered backlog",
            "self-correction after failure",
            "user authority over consequential effects",
            "secrets remain outside genome and lineage",
            "verification before final handoff",
            "host and model are replaceable compute organs",
        ]
    },
    "cycle": [
        "recover",
        "sense",
        "focus",
        "resonance",
        "select_organs",
        "execute",
        "verify",
        "mutate",
        "transfer",
    ],
    "immune_genes": [
        "FAKE_COMPLETION",
        "SUMMARY_THEATER",
        "EXPLANATION_AS_EXECUTION",
        "USER_AS_STORAGE",
        "LOCAL_PATCH_SYSTEMIC_WOUND",
        "INVENTED_MEMORY",
        "HIDDEN_PERSISTENCE",
        "SECRET_CAPTURE",
    ],
    "organs": {
        "focus": {"requires": [], "provides": ["objective_lock"], "core": True},
        "resonance": {"requires": [], "provides": ["candidate_interference"], "core": True},
        "provenance": {"requires": ["local_storage"], "provides": ["lineage"], "core": True},
        "verifier": {"requires": [], "provides": ["release_gate"], "core": True},
        "mutation": {"requires": ["local_storage"], "provides": ["genome_delta"], "core": True},
        "files": {"requires": ["files"], "provides": ["artifact_io"], "core": False},
        "tools": {"requires": ["tools"], "provides": ["actions"], "core": False},
        "mcp": {"requires": ["mcp"], "provides": ["portable_connectors"], "core": False},
        "skills": {"requires": ["skills"], "provides": ["procedural_modules"], "core": False},
        "memory_bridge": {"requires": ["memory"], "provides": ["host_hint_memory"], "core": False},
    },
    "truth_labels": ["OBSERVED", "FILED", "MEMORY", "RECONSTRUCTED", "INFERRED", "UNKNOWN"],
    "mutation_policy": {
        "required": ["evidence", "tests", "rollback", "parent_genome_hash"],
        "automatic_promotion": False,
    },
}


class SeedRuntime:
    def __init__(self, root: Path | str = ".") -> None:
        self.root = Path(root).resolve()
        self.seed_dir = self.root / ".mondayid"
        self.genome_path = self.seed_dir / "genome.json"
        self.state_path = self.seed_dir / "state.json"
        self.ledger_path = self.seed_dir / "ledger.jsonl"
        self.genomes_dir = self.seed_dir / "genomes"
        self.phenotypes_dir = self.seed_dir / "phenotypes"
        self.pending_dir = self.seed_dir / "mutations" / "pending"

    def initialize(self, force: bool = False) -> dict[str, Any]:
        if self.seed_dir.exists() and not force:
            raise SeedError(f"Seed already exists: {self.seed_dir}")
        if self.seed_dir.exists():
            shutil.rmtree(self.seed_dir)
        self.genomes_dir.mkdir(parents=True)
        self.phenotypes_dir.mkdir(parents=True)
        self.pending_dir.mkdir(parents=True)
        genome = copy.deepcopy(DEFAULT_GENOME)
        genome_hash = digest(genome)
        self._write_json(self.genome_path, genome)
        self._write_json(self.genomes_dir / f"{genome_hash}.json", genome)
        state = {
            "schema_version": "mondayid.state.v1",
            "genome_hash": genome_hash,
            "active_objective": None,
            "backlog": [],
            "latest_host": None,
            "latest_phenotype": None,
            "updated_at": now(),
        }
        self._write_json(self.state_path, state)
        event = self._append_event(
            "GENESIS",
            {"genome_hash": genome_hash, "version": genome["version"]},
            {"label": "OBSERVED", "pointer": "local:init"},
        )
        return {"seed_dir": str(self.seed_dir), "genome_hash": genome_hash, "event_hash": event["event_hash"]}

    def _write_json(self, path: Path, value: Any) -> None:
        reject_secrets(value)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def _read_json(self, path: Path) -> Any:
        if not path.exists():
            raise SeedError(f"missing required file: {path}")
        return json.loads(path.read_text(encoding="utf-8"))

    def _ledger(self) -> list[dict[str, Any]]:
        if not self.ledger_path.exists():
            return []
        events = []
        for number, line in enumerate(self.ledger_path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SeedError(f"invalid ledger JSON at line {number}: {exc}") from exc
        return events

    def _append_event(self, event_type: str, payload: dict[str, Any], provenance: dict[str, str]) -> dict[str, Any]:
        reject_secrets({"payload": payload, "provenance": provenance})
        events = self._ledger()
        body = {
            "schema_version": "mondayid.event.v1",
            "event_id": str(uuid.uuid4()),
            "timestamp": now(),
            "type": event_type,
            "payload": payload,
            "provenance": provenance,
            "prev_hash": events[-1]["event_hash"] if events else ZERO_HASH,
        }
        event = dict(body, event_hash=digest(body))
        with self.ledger_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, sort_keys=True, ensure_ascii=False) + "\n")
        return event

    def verify_ledger(self) -> dict[str, Any]:
        prev = ZERO_HASH
        events = self._ledger()
        for index, event in enumerate(events):
            claimed = event.get("event_hash")
            body = {k: v for k, v in event.items() if k != "event_hash"}
            if event.get("prev_hash") != prev:
                raise SeedError(f"ledger chain broken at event {index}")
            if digest(body) != claimed:
                raise SeedError(f"ledger hash mismatch at event {index}")
            prev = claimed
        return {"events": len(events), "head": prev}

    def recover(self) -> dict[str, Any]:
        ledger = self.verify_ledger()
        genome = self._read_json(self.genome_path)
        state = self._read_json(self.state_path)
        genome_hash = digest(genome)
        if state.get("genome_hash") != genome_hash:
            raise SeedError("state genome hash does not match canonical genome")
        snapshot = self.genomes_dir / f"{genome_hash}.json"
        if not snapshot.exists() or digest(self._read_json(snapshot)) != genome_hash:
            raise SeedError("canonical genome snapshot missing or corrupt")
        return {"genome": genome, "genome_hash": genome_hash, "state": state, "ledger": ledger}

    def discover(self, host: str, descriptor: Path | None = None) -> dict[str, Any]:
        profile = discover_host(host, descriptor)
        profile["observed_at"] = now()
        return profile

    def select_organs(self, genome: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
        selected, dormant, missing_core = [], [], []
        caps = profile["capabilities"]
        for name, organ in genome["organs"].items():
            requirements = organ.get("requires", [])
            if all(caps.get(req, False) for req in requirements):
                selected.append(name)
            else:
                dormant.append(name)
                if organ.get("core"):
                    missing_core.append(name)
        return {"selected": selected, "dormant": dormant, "missing_core": missing_core}

    def express(self, host: str, descriptor: Path | None = None) -> dict[str, Any]:
        recovered = self.recover()
        profile = self.discover(host, descriptor)
        organs = self.select_organs(recovered["genome"], profile)
        if organs["missing_core"]:
            raise SeedError(f"host cannot express core organs: {organs['missing_core']}")
        adapter = ADAPTERS[host]
        phenotype_root = self.phenotypes_dir / host
        phenotype_root.mkdir(parents=True, exist_ok=True)
        instruction_path = phenotype_root / adapter.instruction_file
        instruction_path.parent.mkdir(parents=True, exist_ok=True)
        instruction_path.write_text(render_instruction(recovered["genome"], profile), encoding="utf-8")
        files = [str(instruction_path.relative_to(self.root))]
        if adapter.skill_file and profile["capabilities"].get("skills"):
            skill_path = phenotype_root / adapter.skill_file
            skill_path.parent.mkdir(parents=True, exist_ok=True)
            skill_path.write_text(render_skill(), encoding="utf-8")
            files.append(str(skill_path.relative_to(self.root)))
        envelope = {
            "schema_version": "mondayid.phenotype.v1",
            "genome_hash": recovered["genome_hash"],
            "host_profile": profile,
            "organs": organs,
            "continuity_authority": ".mondayid/ledger.jsonl",
            "memory_claim": "external_provenance_only",
        }
        self._write_json(phenotype_root / "seed-envelope.json", envelope)
        self._write_json(phenotype_root / "tools.json", render_tool_manifest(profile, organs["selected"]))
        files.extend([
            str((phenotype_root / "seed-envelope.json").relative_to(self.root)),
            str((phenotype_root / "tools.json").relative_to(self.root)),
        ])
        state = recovered["state"]
        state.update({"latest_host": host, "latest_phenotype": str(phenotype_root), "updated_at": now()})
        self._write_json(self.state_path, state)
        event = self._append_event(
            "PHENOTYPE_EXPRESSED",
            {"host": host, "genome_hash": recovered["genome_hash"], "organs": organs, "files": files},
            {"label": "OBSERVED", "pointer": str(phenotype_root)},
        )
        return {"host": host, "organs": organs, "files": files, "event_hash": event["event_hash"]}

    def set_objective(self, objective: str, backlog: list[str] | None = None) -> dict[str, Any]:
        recovered = self.recover()
        state = recovered["state"]
        state["active_objective"] = objective
        state["backlog"] = backlog or []
        state["updated_at"] = now()
        self._write_json(self.state_path, state)
        event = self._append_event(
            "FOCUS_SET",
            {"objective": objective, "backlog": state["backlog"]},
            {"label": "OBSERVED", "pointer": "user:current_instruction"},
        )
        return {"objective": objective, "event_hash": event["event_hash"]}

    def propose_mutation(self, change: dict[str, Any]) -> dict[str, Any]:
        recovered = self.recover()
        required = {"path", "op", "value", "evidence", "tests", "rollback"}
        missing = sorted(required - change.keys())
        if missing:
            raise SeedError(f"mutation missing fields: {missing}")
        if change["op"] not in {"set", "append"}:
            raise SeedError("mutation op must be set or append")
        mutation = {
            "schema_version": "mondayid.mutation.v1",
            "mutation_id": str(uuid.uuid4()),
            "status": "proposed",
            "parent_genome_hash": recovered["genome_hash"],
            "created_at": now(),
            **change,
        }
        reject_secrets(mutation)
        self._write_json(self.pending_dir / f"{mutation['mutation_id']}.json", mutation)
        self._append_event(
            "MUTATION_PROPOSED",
            {"mutation_id": mutation["mutation_id"], "parent_genome_hash": recovered["genome_hash"]},
            {"label": "FILED", "pointer": f"mutations/pending/{mutation['mutation_id']}.json"},
        )
        return mutation

    def _apply_change(self, genome: dict[str, Any], mutation: dict[str, Any]) -> dict[str, Any]:
        result = copy.deepcopy(genome)
        parts = mutation["path"].split(".")
        cursor: Any = result
        for part in parts[:-1]:
            if part not in cursor or not isinstance(cursor[part], (dict, list)):
                raise SeedError(f"mutation path not found: {mutation['path']}")
            cursor = cursor[part]
        leaf = parts[-1]
        if mutation["op"] == "set":
            if not isinstance(cursor, dict) or leaf not in cursor:
                raise SeedError(f"set target not found: {mutation['path']}")
            cursor[leaf] = mutation["value"]
        else:
            if not isinstance(cursor, dict) or not isinstance(cursor.get(leaf), list):
                raise SeedError(f"append target is not a list: {mutation['path']}")
            cursor[leaf].append(mutation["value"])
        return result

    def accept_mutation(self, mutation_id: str) -> dict[str, Any]:
        path = self.pending_dir / f"{mutation_id}.json"
        mutation = self._read_json(path)
        recovered = self.recover()
        if mutation["parent_genome_hash"] != recovered["genome_hash"]:
            self._reject_mutation(path, mutation, "mutation parent is stale; create a new proposal against canonical state")
        tests = mutation.get("tests", [])
        if not tests or any(item.get("status") != "passed" for item in tests):
            self._reject_mutation(path, mutation, "all mutation tests must be present and passed")
        evidence = mutation.get("evidence", [])
        if not evidence or any(not item.get("pointer") for item in evidence):
            self._reject_mutation(path, mutation, "mutation requires evidence pointers")
        try:
            updated = self._apply_change(recovered["genome"], mutation)
        except SeedError as exc:
            self._reject_mutation(path, mutation, str(exc))
        updated["parent_hash"] = recovered["genome_hash"]
        updated["version"] = self._next_version(updated["version"])
        new_hash = digest(updated)
        self._write_json(self.genomes_dir / f"{new_hash}.json", updated)
        self._write_json(self.genome_path, updated)
        state = recovered["state"]
        state["genome_hash"] = new_hash
        state["updated_at"] = now()
        self._write_json(self.state_path, state)
        mutation["status"] = "accepted"
        mutation["accepted_at"] = now()
        mutation["result_genome_hash"] = new_hash
        accepted_path = self.seed_dir / "mutations" / "accepted" / f"{mutation_id}.json"
        self._write_json(accepted_path, mutation)
        path.unlink()
        event = self._append_event(
            "MUTATION_ACCEPTED",
            {"mutation_id": mutation_id, "parent_hash": recovered["genome_hash"], "genome_hash": new_hash},
            {"label": "OBSERVED", "pointer": str(accepted_path.relative_to(self.root))},
        )
        return {"mutation_id": mutation_id, "genome_hash": new_hash, "event_hash": event["event_hash"]}

    def _reject_mutation(self, path: Path, mutation: dict[str, Any], reason: str) -> None:
        mutation["status"] = "rejected"
        mutation["rejected_at"] = now()
        mutation["rejection_reason"] = reason
        rejected_path = self.seed_dir / "mutations" / "rejected" / path.name
        self._write_json(rejected_path, mutation)
        path.unlink()
        self._append_event(
            "MUTATION_REJECTED",
            {"mutation_id": mutation["mutation_id"], "reason": reason},
            {"label": "OBSERVED", "pointer": str(rejected_path.relative_to(self.root))},
        )
        raise SeedError(reason)

    def export_delta(self, from_hash: str, output: Path) -> dict[str, Any]:
        recovered = self.recover()
        if not (self.genomes_dir / f"{from_hash}.json").exists():
            raise SeedError("unknown source genome hash")
        accepted_dir = self.seed_dir / "mutations" / "accepted"
        accepted: list[dict[str, Any]] = []
        if accepted_dir.exists():
            accepted = [self._read_json(path) for path in accepted_dir.glob("*.json")]
        by_result = {item.get("result_genome_hash"): item for item in accepted}
        mutations_reversed: list[dict[str, Any]] = []
        cursor = recovered["genome_hash"]
        while cursor != from_hash:
            item = by_result.get(cursor)
            if not item:
                raise SeedError("source hash is not an ancestor of the canonical genome")
            mutations_reversed.append(item)
            cursor = item["parent_genome_hash"]
        mutations = list(reversed(mutations_reversed))
        delta = {
            "schema_version": "mondayid.delta.v1",
            "from_hash": from_hash,
            "to_hash": recovered["genome_hash"],
            "mutations": mutations,
            "ledger_head": recovered["ledger"]["head"],
            "created_at": now(),
        }
        self._write_json(output, delta)
        return delta

    def self_test(self, host: str | None = None, descriptor: Path | None = None) -> dict[str, Any]:
        checks: list[dict[str, Any]] = []

        def check(name: str, fn: Any) -> None:
            try:
                detail = fn()
                checks.append({"name": name, "status": "passed", "detail": detail})
            except Exception as exc:  # self-test must report all failures
                checks.append({"name": name, "status": "failed", "detail": str(exc)})

        check("ledger_chain", self.verify_ledger)
        check("canonical_recovery", lambda: {"genome_hash": self.recover()["genome_hash"]})
        check("secret_membrane", lambda: self._secret_test())
        check("constitution", lambda: self._constitution_test())
        if host:
            check("host_discovery", lambda: self.discover(host, descriptor))
            check("organ_closure", lambda: self._organ_test(host, descriptor))
        verdict = "passed" if all(item["status"] == "passed" for item in checks) else "failed"
        report = {"schema_version": "mondayid.selftest.v1", "verdict": verdict, "checks": checks, "tested_at": now()}
        if self.seed_dir.exists():
            self._write_json(self.seed_dir / "last-self-test.json", report)
        return report

    def _secret_test(self) -> dict[str, bool]:
        try:
            reject_secrets({"api_key": "sk-this-is-a-test-secret-123456"})
        except SeedError:
            return {"synthetic_secret_rejected": True}
        raise SeedError("synthetic secret was not rejected")

    def _constitution_test(self) -> dict[str, Any]:
        genome = self.recover()["genome"]
        required = {"evidence over invented memory", "verification before final handoff", "host and model are replaceable compute organs"}
        missing = required - set(genome["constitution"]["laws"])
        if missing:
            raise SeedError(f"missing constitutional laws: {sorted(missing)}")
        return {"required_laws": len(required)}

    def _organ_test(self, host: str, descriptor: Path | None) -> dict[str, Any]:
        recovered = self.recover()
        profile = self.discover(host, descriptor)
        result = self.select_organs(recovered["genome"], profile)
        if result["missing_core"]:
            raise SeedError(f"missing core organs: {result['missing_core']}")
        return result

    @staticmethod
    def _next_version(version: str) -> str:
        major, minor, patch = (int(item) for item in version.split("."))
        return f"{major}.{minor}.{patch + 1}"

    def bootstrap(self, host: str, descriptor: Path | None = None) -> dict[str, Any]:
        phenotype = self.express(host, descriptor)
        tests = self.self_test(host, descriptor)
        if tests["verdict"] != "passed":
            raise SeedError("phenotype self-test failed")
        recovered = self.recover()
        return {
            "host": host,
            "genome_hash": recovered["genome_hash"],
            "ledger_head": recovered["ledger"]["head"],
            "phenotype": phenotype,
            "self_test": tests,
            "continuity_claim": "external provenance restored; no claim of native model memory",
        }
