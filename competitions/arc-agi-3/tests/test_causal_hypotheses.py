"""Evidence-gated counterfactual probes; deliberately not an ARC score."""
import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'experiments' / 'causal_hypotheses.py'
spec = importlib.util.spec_from_file_location('causal_hypotheses', MODULE)
assert spec and spec.loader
ch = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = ch
spec.loader.exec_module(ch)


def obj(color, x, y):
    return (color, 1, x, y, x, y)


class CausalHypothesisTests(unittest.TestCase):
    def setUp(self):
        self.s0 = (obj(3, 3, 4),)
        self.s1 = (obj(3, 4, 4),)
        self.s2 = (obj(3, 3, 5),)

    def test_testable_disagreement_and_observed_reversal(self):
        examples = [
            ch.Transition('ACTION1', self.s0, self.s1, 0, 0),
            ch.Transition('ACTION2', self.s1, self.s0, 0, 0),
            ch.Transition('ACTION3', self.s0, self.s0, 0, 0),
        ]
        choice = ch.choose_probe(self.s0, ['ACTION1', 'ACTION3'], examples)
        self.assertIsNotNone(choice)
        self.assertEqual(choice.action, 'ACTION1')
        self.assertEqual(choice.reversal_action, 'ACTION2')
        self.assertGreaterEqual(len(choice.predictions), 2)
        self.assertIn(self.s0, choice.predictions)
        self.assertIn(self.s1, choice.predictions)
        self.assertGreater(choice.disagreement, 0)

    def test_no_unwitnessed_reversible_action(self):
        examples = [ch.Transition('ACTION1', self.s0, self.s1, 0, 0)]
        self.assertIsNone(ch.choose_probe(self.s0, ['ACTION1'], examples))

    def test_reversal_at_other_level_is_not_witness(self):
        examples = [
            ch.Transition('ACTION1', self.s0, self.s1, 0, 0),
            ch.Transition('ACTION2', self.s1, self.s0, 1, 1),
        ]
        self.assertIsNone(ch.choose_probe(self.s0, ['ACTION1'], examples, level=0))

    def test_progressing_action_is_not_reversible_probe(self):
        examples = [
            ch.Transition('ACTION1', self.s0, self.s1, 0, 1),
            ch.Transition('ACTION2', self.s1, self.s0, 1, 0),
        ]
        self.assertIsNone(ch.choose_probe(self.s0, ['ACTION1'], examples))

    def test_only_advertised_actions(self):
        examples = [
            ch.Transition('ACTION1', self.s0, self.s1, 0, 0),
            ch.Transition('ACTION2', self.s1, self.s0, 0, 0),
        ]
        self.assertIsNone(ch.choose_probe(self.s0, ['ACTION3'], examples))

    def test_no_disagreement_if_all_predictions_same(self):
        examples = [ch.Transition('ACTION1', self.s0, self.s0, 0, 0)]
        self.assertIsNone(ch.choose_probe(self.s0, ['ACTION1'], examples))

    def test_distinct_recolor_hypothesis(self):
        recolored = (obj(5, 3, 4),)
        hs = ch.fit_hypotheses([ch.Transition('ACTION5', self.s0, recolored, 0, 0)], 'ACTION5')
        predicted = {ch.predict(h.model, self.s0) for h in hs}
        self.assertIn(recolored, predicted)
        self.assertIn(self.s0, predicted)

    def test_translation_outside_bounds_rejected(self):
        far = (obj(3, 63, 4),)
        model = ch.Model('translate', dx=1)
        self.assertIsNone(ch.predict(model, far))

    def test_reversal_is_context_specific(self):
        examples = [
            ch.Transition('ACTION1', self.s0, self.s1, 0, 0),
            ch.Transition('ACTION2', self.s1, self.s0, 0, 0),
        ]
        self.assertIsNone(ch.choose_probe(self.s2, ['ACTION1'], examples))

    def test_evidence_limit_is_bounded(self):
        examples = [
            ch.Transition('ACTION1', self.s0, self.s1, 0, 0),
            ch.Transition('ACTION2', self.s1, self.s0, 0, 0),
        ] * 1000
        choice = ch.choose_probe(self.s0, ['ACTION1'], examples, max_examples=8)
        self.assertIsNotNone(choice)
        self.assertLessEqual(choice.evidence_count, 8)


if __name__ == '__main__':
    unittest.main()
