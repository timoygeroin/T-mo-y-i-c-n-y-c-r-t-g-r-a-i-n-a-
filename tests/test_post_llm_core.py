from post_llm_core import Action, CognitiveRuntime, CognitiveState, Hypothesis


def test_closed_loop_records_evidence_and_updates_state():
    runtime = CognitiveRuntime(CognitiveState(identity="monday-core"))
    hypothesis = Hypothesis(
        statement="switch is operational",
        predicted_observation="ON",
        causal_key="switch-v1",
    )
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
    hypothesis = Hypothesis(
        statement="switch is operational",
        predicted_observation="ON",
        causal_key="switch-v1",
    )
    transition = runtime.transition(
        goal="verify switch",
        hypotheses=[hypothesis],
        chooser=lambda xs: xs[0],
        actor=lambda action: "OFF",
        action=Action(name="read_switch"),
    )

    assert transition.evidence.supported is False
    assert "switch-v1" in runtime.state.world_model["invalidated_causal_keys"]
