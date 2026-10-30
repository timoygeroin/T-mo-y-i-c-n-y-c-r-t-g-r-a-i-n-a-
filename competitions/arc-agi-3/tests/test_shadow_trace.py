"""Leakage and action-identity controls for offline ARC shadow evaluation."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from shadow_trace import evaluate


def scene(x):
    return [[3, 1, x, 4, x, 4]]


def record(game, turn, before, after, action='ACTION1', level=0, next_level=None, legal=None):
    return {
        'schema': 'arc-agi3.shadow-transition.v1', 'game_id': game,
        'turn': turn, 'action_key': action,
        'level_before': level, 'level_after': level if next_level is None else next_level,
        'before_scene': scene(before), 'after_scene': scene(after),
        'legal_actions': legal if legal is not None else ['ACTION1', 'ACTION2'],
    }


class ShadowTraceTests(unittest.TestCase):
    def test_prequential_prediction_no_current_outcome_leakage(self):
        rows = [record('a', 0, 3, 4), record('a', 1, 4, 5)]
        one = evaluate(rows[:1])
        two = evaluate(rows)
        self.assertEqual(one['evaluated'], 0)
        self.assertEqual(two['evaluated'], 1)
        self.assertEqual(two['exact_correct'], 1)
        self.assertEqual(two['static_correct'], 0)
        self.assertEqual(two['non_static_predictions'], 1)

    def test_no_cross_game_or_cross_level_transfer(self):
        self.assertEqual(evaluate([record('a', 0, 3, 4), record('b', 0, 4, 5)])['evaluated'], 0)
        self.assertEqual(evaluate([record('a', 0, 3, 4), record('a', 1, 4, 5, level=1)])['evaluated'], 0)

    def test_click_coordinates_not_pooled(self):
        rows = [record('a', 0, 3, 4, 'ACTION6@2,3', legal=['ACTION6']),
                record('a', 1, 4, 5, 'ACTION6@9,9', legal=['ACTION6']),
                record('a', 2, 5, 6, 'ACTION6@2,3', legal=['ACTION6'])]
        result = evaluate(rows)
        self.assertEqual(result['evaluated'], 1)
        self.assertEqual(result['exact_correct'], 1)

    def test_episode_restart_does_not_leak(self):
        rows = [record('a', 0, 3, 4), record('a', 0, 4, 5)]
        self.assertEqual(evaluate(rows)['evaluated'], 0)

    def test_progress_transition_is_not_training_evidence(self):
        rows = [record('a', 0, 3, 4, next_level=1), record('a', 1, 4, 5)]
        self.assertEqual(evaluate(rows)['evaluated'], 0)

    def test_illegal_record_rejected(self):
        with self.assertRaises(ValueError):
            evaluate([record('a', 0, 3, 4, action='ACTION4')])

    def test_malformed_scene_rejected(self):
        row = record('a', 0, 3, 4)
        row['after_scene'] = [[3, 1, 63, 4, 64, 4]]
        with self.assertRaises(ValueError):
            evaluate([row])

    def test_empty_and_bounded(self):
        self.assertEqual(evaluate([])['records'], 0)
        with self.assertRaises(ValueError):
            evaluate([], max_history=0)


if __name__ == '__main__':
    unittest.main()
