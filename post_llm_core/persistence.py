from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .types import Action, CognitiveState, Evidence, Hypothesis, Transition


class JSONStateStore:
    """Atomic JSON persistence for CognitiveState across process boundaries."""

    def __init__(self, path: str | os.PathLike[str]):
        self.path = Path(path)

    def save(self, state: CognitiveState) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = self._state_to_dict(state)
        encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, indent=2)

        fd, temporary_name = tempfile.mkstemp(
            prefix=f".{self.path.name}.",
            suffix=".tmp",
            dir=str(self.path.parent),
            text=True,
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_name, self.path)
        except BaseException:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
            raise

    def load(self) -> CognitiveState:
        with self.path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return self._state_from_dict(payload)

    @staticmethod
    def _state_to_dict(state: CognitiveState) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "identity": state.identity,
            "goals": list(state.goals),
            "beliefs": state.beliefs,
            "memory": list(state.memory),
            "world_model": state.world_model,
            "self_model": state.self_model,
            "attention": list(state.attention),
            "history": [asdict(transition) for transition in state.history],
        }

    @staticmethod
    def _state_from_dict(payload: dict[str, Any]) -> CognitiveState:
        schema_version = payload.get("schema_version")
        if schema_version != 1:
            raise ValueError(f"Unsupported cognitive state schema version: {schema_version!r}")

        history = []
        for item in payload.get("history", []):
            history.append(
                Transition(
                    goal=item["goal"],
                    hypothesis=Hypothesis(**item["hypothesis"]),
                    action=Action(**item["action"]),
                    evidence=Evidence(**item["evidence"]),
                    prior_state_digest=item["prior_state_digest"],
                    next_state_digest=item["next_state_digest"],
                )
            )

        return CognitiveState(
            identity=payload["identity"],
            goals=list(payload.get("goals", [])),
            beliefs=dict(payload.get("beliefs", {})),
            memory=list(payload.get("memory", [])),
            world_model=dict(payload.get("world_model", {})),
            self_model=dict(payload.get("self_model", {})),
            attention=tuple(payload.get("attention", [])),
            history=history,
        )
