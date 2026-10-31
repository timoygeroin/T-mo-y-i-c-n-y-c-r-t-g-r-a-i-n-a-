import unittest

try:
    from agent.world_compiler import WorldCompiler
except ModuleNotFoundError:
    WorldCompiler = None


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


if __name__ == "__main__":
    unittest.main()
