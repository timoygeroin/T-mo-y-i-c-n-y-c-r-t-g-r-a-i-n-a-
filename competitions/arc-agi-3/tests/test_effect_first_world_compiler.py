import unittest

try:
    from agent.world_compiler import (WorldCompiler, SharedLatentField, StigmergicMemory, AgentFossilGenome, run_synthetic_ecology)
except ModuleNotFoundError:
    WorldCompiler = SharedLatentField = StigmergicMemory = AgentFossilGenome = run_synthetic_ecology = None


class EffectFirstWorldCompilerTests(unittest.TestCase):
    def test_probe_uses_world_disagreement_and_failure_genome(self):
        self.assertIsNotNone(
            WorldCompiler,
            "effect-first world compiler is missing",
        )
        compiler = WorldCompiler(
            worlds=("W1", "W2", "W3", "W4"),
            predictions={
                "ACTION1": {
                    "W1": "SAME", "W2": "SAME", "W3": "SAME", "W4": "SAME",
                },
                "ACTION2": {
                    "W1": "LEFT", "W2": "LEFT", "W3": "RIGHT", "W4": "RIGHT",
                },
                "ACTION3": {
                    "W1": "A", "W2": "B", "W3": "C", "W4": "D",
                },
            },
            failure_genome={
                "ACTION3": {
                    "class": "REPEATED_NOOP_OR_WASTEFUL_PROBE",
                    "confidence": 1.0,
                }
            },
        )

        decision = compiler.choose_probe(("ACTION1", "ACTION2", "ACTION3"))

        self.assertEqual(decision.action, "ACTION2")
        self.assertGreater(decision.information_gain, 0.0)
        self.assertIn("ACTION3", decision.vetoed_actions)

        survivors = compiler.observe("ACTION2", "LEFT")
        self.assertEqual(survivors, ("W1", "W2"))

    def test_effect_first_beats_historical_success_when_success_is_uninformative(self):
        self.assertIsNotNone(WorldCompiler, "effect-first world compiler is missing")
        compiler = WorldCompiler(
            worlds=("door", "switch"),
            predictions={
                "ACTION1": {"door": "UNCHANGED", "switch": "UNCHANGED"},
                "ACTION2": {"door": "OPEN", "switch": "UNCHANGED"},
            },
            historical_success={"ACTION1": 0.95, "ACTION2": 0.10},
        )

        decision = compiler.choose_probe(("ACTION1", "ACTION2"))

        self.assertEqual(decision.action, "ACTION2")
        self.assertEqual(decision.reason, "MAX_WORLD_DISCRIMINATION")


    def test_shared_latent_field_transmits_belief_without_text_chat(self):
        self.assertIsNotNone(SharedLatentField)
        field = SharedLatentField()
        field.publish("vision", {"door": 0.8, "switch": 0.2}, confidence=0.9)
        field.publish("causal", {"door": 0.6, "switch": 0.4}, confidence=0.7)

        merged = field.read()

        self.assertGreater(merged["door"], merged["switch"])
        self.assertAlmostEqual(sum(merged.values()), 1.0, places=6)

    def test_stigmergy_treats_environment_change_as_external_memory(self):
        self.assertIsNotNone(StigmergicMemory)
        memory = StigmergicMemory()
        memory.observe("S0", "ACTION2", "S1")
        memory.observe("S1", "ACTION2", "S2")
        memory.observe("S2", "ACTION4", "S3")

        self.assertEqual(memory.predict("S1", "ACTION2"), "S2")
        self.assertEqual(memory.replay(("S0", "ACTION2", "ACTION2")), "S2")
        self.assertGreater(memory.novelty("S3"), memory.novelty("S2"))


    def test_old_agent_becomes_scoped_fossil_genome_not_global_law(self):
        self.assertIsNotNone(AgentFossilGenome)
        genome = AgentFossilGenome.from_novelty_agent_retrospective()

        self.assertEqual(genome.gene("LEGAL_ACTION_DISCIPLINE").disposition, "INHERIT")
        self.assertEqual(genome.gene("COORDINATE_CLICK_IDENTITY").disposition, "INHERIT")
        mixed = genome.gene("CLICK_STAGNATION_GATE")
        self.assertEqual(mixed.disposition, "SCOPED_ONLY")
        self.assertEqual(mixed.exposed_worlds, 3)
        self.assertEqual(mixed.total_worlds, 25)
        self.assertLess(mixed.generalization_weight, 0.20)
        self.assertIn("mixed_regression", mixed.failure_modes)

    def test_fossil_prior_never_overrides_stronger_world_discrimination(self):
        genome = AgentFossilGenome.from_novelty_agent_retrospective()
        compiler = WorldCompiler(
            worlds=("W1", "W2", "W3", "W4"),
            predictions={
                "HABIT": {"W1":"SAME","W2":"SAME","W3":"SAME","W4":"SAME"},
                "PROBE": {"W1":"L","W2":"L","W3":"R","W4":"R"},
            },
            fossil_genome=genome,
            fossil_action_map={"HABIT":"CLICK_STAGNATION_GATE"},
        )

        decision = compiler.choose_probe(("HABIT","PROBE"))
        self.assertEqual(decision.action, "PROBE")

    def test_effect_first_ecology_beats_habit_baseline_across_hidden_rule_families(self):
        self.assertIsNotNone(run_synthetic_ecology)
        result = run_synthetic_ecology(seed=17, episodes_per_family=40)

        self.assertGreaterEqual(result["families"], 4)
        self.assertEqual(result["episodes"], result["families"] * 40)
        self.assertLess(result["effect_first_mean_actions"], result["habit_mean_actions"])
        self.assertGreater(result["effect_first_success_rate"], result["habit_success_rate"])
        self.assertGreaterEqual(result["families_won"], 3)


if __name__ == "__main__":
    unittest.main()
