import json
import subprocess
import sys

import pytest

from post_llm_core import (
    Action,
    CognitiveRuntime,
    CognitiveState,
    CognitiveSubstrate,
    Hypothesis,
    JSONStateStore,
    MemoryTrace,
)


def test_closed_loop_records_evidence_and_updates_state():
    runtime = CognitiveRuntime(CognitiveState(identity="monday-core"))
    hypothesis = Hypothesis("switch is operational", "ON", "switch-v1")
    transition = runtime.transition(
        goal="verify switch",
        hypotheses=[hypothesis],
        chooser=lambda xs: xs[0],
        actor=lambda action: "ON",
        action=Action(name="read_switch"),
        provenance="test-environment",
    )
    assert transition.evidence.supported is True
    assert runtime.state.beliefs["switch is operational"] is True
    assert runtime.state.history[-1].next_state_digest


def test_failed_prediction_invalidates_causal_line():
    runtime = CognitiveRuntime(CognitiveState(identity="monday-core"))
    hypothesis = Hypothesis("switch is operational", "ON", "switch-v1")
    transition = runtime.transition(
        goal="verify switch",
        hypotheses=[hypothesis],
        chooser=lambda xs: xs[0],
        actor=lambda action: "OFF",
        action=Action(name="read_switch"),
    )
    assert transition.evidence.supported is False
    assert "switch-v1" in runtime.state.world_model["invalidated_causal_keys"]


def test_substrate_persists_memory_and_focuses_attention():
    state = CognitiveState(identity="monday-core", goals=["verify switch"])
    substrate = CognitiveSubstrate(state)
    substrate.remember(MemoryTrace("episodic", "switch", "ON", "sensor", 2.0))
    substrate.remember(MemoryTrace("episodic", "battery", "LOW", "sensor", 0.5))
    assert substrate.recall("switch")[0]["value"] == "ON"
    assert substrate.focus(["battery status", "switch status"])[0] == "switch status"


def test_invalidated_model_cannot_be_selected_again():
    state = CognitiveState(identity="monday-core")
    state.world_model["invalidated_causal_keys"] = ["bad-model"]
    substrate = CognitiveSubstrate(state)
    hypotheses = [
        Hypothesis("bad", "x", "bad-model"),
        Hypothesis("new", "y", "new-model"),
    ]
    assert substrate.next_hypothesis(hypotheses).causal_key == "new-model"


def test_runtime_filters_invalidated_model_before_chooser():
    state = CognitiveState(identity="monday-core")
    state.world_model["invalidated_causal_keys"] = ["bad-model"]
    runtime = CognitiveRuntime(state)
    bad = Hypothesis("bad", "x", "bad-model")
    new = Hypothesis("new", "y", "new-model")

    seen_candidates = []

    def chooser(candidates):
        seen_candidates.extend(candidates)
        return candidates[0]

    transition = runtime.transition(
        goal="do not repeat disproven causal line",
        hypotheses=[bad, new],
        chooser=chooser,
        actor=lambda action: "y",
        action=Action(name="probe"),
    )

    assert seen_candidates == [new]
    assert transition.hypothesis.causal_key == "new-model"


def test_runtime_rejects_chooser_escape_from_viable_set():
    runtime = CognitiveRuntime(CognitiveState(identity="monday-core"))
    supplied = Hypothesis("supplied", "ok", "supplied-model")
    escaped = Hypothesis("escaped", "ok", "escaped-model")

    with pytest.raises(ValueError, match="outside the viable candidate set"):
        runtime.transition(
            goal="enforce candidate boundary",
            hypotheses=[supplied],
            chooser=lambda candidates: escaped,
            actor=lambda action: "ok",
            action=Action(name="probe"),
        )


def test_json_state_store_round_trip_preserves_history_and_invalidations(tmp_path):
    state = CognitiveState(identity="monday-core", goals=["learn from failure"])
    runtime = CognitiveRuntime(state)
    runtime.transition(
        goal="learn from failure",
        hypotheses=[Hypothesis("old route works", "PASS", "route-v1")],
        chooser=lambda candidates: candidates[0],
        actor=lambda action: "FAIL",
        action=Action(name="held_out_probe", payload={"case": 7}),
        provenance="held-out-test",
    )

    store = JSONStateStore(tmp_path / "state.json")
    store.save(runtime.state)
    restored = store.load()

    assert restored.identity == runtime.state.identity
    assert restored.goals == runtime.state.goals
    assert restored.world_model == runtime.state.world_model
    assert restored.memory == runtime.state.memory
    assert restored.history == runtime.state.history
    assert restored.attention == runtime.state.attention


def test_json_state_survives_fresh_python_process(tmp_path):
    path = tmp_path / "state.json"
    state = CognitiveState(identity="monday-core")
    state.world_model["invalidated_causal_keys"] = ["route-v1"]
    JSONStateStore(path).save(state)

    program = (
        "import json, sys; "
        "from post_llm_core import JSONStateStore; "
        "state = JSONStateStore(sys.argv[1]).load(); "
        "print(json.dumps({'identity': state.identity, "
        "'invalidated': state.world_model['invalidated_causal_keys']}))"
    )
    result = subprocess.run(
        [sys.executable, "-c", program, str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    recovered = json.loads(result.stdout)

    assert recovered == {
        "identity": "monday-core",
        "invalidated": ["route-v1"],
    }
