from post_llm_core import (
    Action,
    CognitiveRuntime,
    CognitiveState,
    CognitiveSubstrate,
    Hypothesis,
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
