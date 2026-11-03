"""Test-first contracts for conservative, shadow-only one-object action effects."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from single_object_prequential import evaluate


def obj(color, x, y=2):
    return [color, 1, x, y, x, y]


def scene(x, y=2):
    return [obj(2, x, y), obj(5, 30, 30)]


def row(turn, before, after, game='g', action='ACTION1', lb=0, la=None, legal=None):
    return dict(schema='arc-agi3.shadow-transition.v1', game_id=game, turn=turn,
                action_key=action, legal_actions=['ACTION1', 'ACTION2', 'ACTION6'] if legal is None else legal,
                level_before=lb, level_after=lb if la is None else la,
                before_scene=before, after_scene=after)


class SingleObjectPrequentialTests(unittest.TestCase):
    def test_one_object_translation_generalizes_to_new_position_without_future_label(self):
        records = [row(0, scene(3), scene(4)), row(1, scene(12), scene(13))]
        first = evaluate(records[:1])
        self.assertEqual(first['effect_nonstatic'], 0)
        result = evaluate(records)
        self.assertEqual(result['same_level_records'], 2)
        self.assertEqual(result['static_correct'], 0)
        self.assertEqual(result['replay_correct'], 0)
        self.assertEqual(result['effect_nonstatic'], 1)
        self.assertEqual(result['effect_nonstatic_correct'], 1)
        self.assertEqual(result['effect_unseen_correct'], 1)
        self.assertEqual(result['combined_correct'], 1)

    def test_exact_replay_is_priority_over_general_effect(self):
        result = evaluate([row(0, scene(3), scene(4)), row(1, scene(3), scene(4))])
        self.assertEqual(result['replay_used'], 1)
        self.assertEqual(result['combined_replay_used'], 1)
        self.assertEqual(result['combined_effect_used'], 0)
        self.assertEqual(result['combined_correct'], 1)

    def test_static_history_does_not_invent_movement(self):
        result = evaluate([row(0, scene(3), scene(3)), row(1, scene(12), scene(12))])
        self.assertEqual(result['effect_nonstatic'], 0)
        self.assertEqual(result['effect_correct'], 2)

    def test_conflicting_action_effect_abstains_on_unseen_scene(self):
        result = evaluate([row(0, scene(3), scene(4)),
                           row(1, scene(12), scene(11)),
                           row(2, scene(20), scene(20))])
        self.assertEqual(result['effect_nonstatic'], 1)
        self.assertEqual(result['combined_effect_used'], 1)
        self.assertGreaterEqual(result['ambiguous_effect_abstentions'], 1)

    def test_duplicate_movable_signature_abstains(self):
        duplicated = [obj(2, 12), obj(2, 20), obj(5, 30, 30)]
        result = evaluate([row(0, scene(3), scene(4)),
                           row(1, duplicated, duplicated)])
        self.assertEqual(result['effect_nonstatic'], 0)

    def test_reset_clears_action_effect_history(self):
        result = evaluate([row(0, scene(3), scene(4)),
                           row(1, scene(3), scene(3), action='RESET', legal=[]),
                           row(2, scene(12), scene(12))])
        self.assertEqual(result['reset_records'], 1)
        self.assertEqual(result['effect_nonstatic'], 0)

    def test_game_level_and_discontinuous_turn_boundaries(self):
        result = evaluate([row(0, scene(3), scene(4)),
                           row(0, scene(12), scene(12), game='h'),
                           row(1, scene(3), scene(4), game='h', la=1),
                           row(2, scene(12), scene(12), game='h', lb=1),
                           row(4, scene(12), scene(12), game='h', lb=1)])
        self.assertEqual(result['level_advance_records'], 1)
        self.assertEqual(result['effect_nonstatic'], 0)

    def test_action6_click_coordinates_not_pooled(self):
        result = evaluate([row(0, scene(3), scene(4), action='ACTION6@1,2'),
                           row(1, scene(12), scene(12), action='ACTION6@7,8')])
        self.assertEqual(result['effect_nonstatic'], 0)

    def test_illegal_actions_and_bad_scenes_fail_closed(self):
        with self.assertRaises(ValueError):
            evaluate([row(0, scene(3), scene(4), action='ACTION9')])
        with self.assertRaises(ValueError):
            evaluate([row(0, [[2, 1, 64, 2, 64, 2]], scene(4))])
        with self.assertRaises(ValueError):
            evaluate([row(0, scene(3), scene(4), action='ACTION6')])

    def test_record_limit_and_empty(self):
        self.assertEqual(evaluate([])['records'], 0)
        with self.assertRaises(ValueError):
            evaluate([row(0, scene(3), scene(4))], max_records=0)
        with self.assertRaises(ValueError):
            evaluate([row(0, scene(3), scene(4)), row(1, scene(4), scene(5))],
                     max_records=1)


if __name__ == '__main__':
    unittest.main()
