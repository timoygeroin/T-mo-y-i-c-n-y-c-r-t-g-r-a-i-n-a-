"""RESET is a special environment action, not a legal gameplay move.

A reset must terminate the causal/predictive episode; neither the RESET
transition nor a transition spanning it may train or score a model.
"""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from shadow_trace import evaluate as shadow_evaluate
from action_conditioned_audit import score_steps as action_steps
from edge_predictive_audit import score_steps as edge_steps


def row(turn, action='ACTION1', before=1, after=2):
    scene = lambda x: [[3, 1, x, 4, x, 4]]
    return {
        'schema': 'arc-agi3.shadow-transition.v1',
        'game_id': 'test', 'turn': turn, 'action_key': action,
        'level_before': 0, 'level_after': 0,
        'before_scene': scene(before), 'after_scene': scene(after),
        'legal_actions': ['ACTION1'],
        'pixel_changes': 0,
        'spatial_delta': {
            'schema': 'arc-agi3.spatial-delta.v1',
            'height': 64, 'width': 64, 'edge_band': 8, 'tile_size': 8,
            'total_changes': 0, 'border_changes': 0, 'interior_changes': 0,
        },
    }


class ResetBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            row(0, before=1, after=2),
            row(1, before=2, after=3),
            row(2, action='RESET', before=3, after=1),
            row(3, before=1, after=2),
            row(4, before=2, after=3),
        ]

    def test_shadow_accepts_special_reset_and_excludes_it(self):
        result = shadow_evaluate(self.rows)
        self.assertEqual(result['records'], 5)
        self.assertEqual(result['reset_records'], 1)
        self.assertEqual(result['evaluated'], 2)

    def test_action_conditional_reset_clears_history(self):
        steps = action_steps(self.rows)
        self.assertEqual([s['turn'] for s in steps], [1, 4])
        self.assertFalse(steps[-1]['seen_action'])
        self.assertFalse(steps[-1]['seen_action_edge'])

    def test_edge_predictor_reset_clears_history(self):
        self.assertEqual([s['turn'] for s in edge_steps(self.rows)], [1, 4])

    def test_only_exact_reset_is_special(self):
        bad = [row(0, action='RESET@1,2')]
        with self.assertRaises(ValueError):
            shadow_evaluate(bad)

if __name__ == '__main__':
    unittest.main()
