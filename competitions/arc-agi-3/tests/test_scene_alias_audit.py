"""Read-only representation-alias controls for ARC public transition traces."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from scene_alias_audit import evaluate_aliases


def row(turn, before, after, before_hash, after_hash, pixels, *, game='g', action='ACTION1', level=0, next_level=None):
    return {
        'schema': 'arc-agi3.shadow-transition.v1', 'game_id': game,
        'turn': turn, 'action_key': action,
        'level_before': level, 'level_after': level if next_level is None else next_level,
        'before_scene': [[3, 1, before, 4, before, 4]],
        'after_scene': [[3, 1, after, 4, after, 4]],
        'legal_actions': ['ACTION1', 'ACTION2'],
        'before_frame_sha256': before_hash * 64,
        'after_frame_sha256': after_hash * 64,
        'pixel_changes': pixels,
    }


class SceneAliasAuditTests(unittest.TestCase):
    def test_detects_pixel_change_hidden_by_scene_descriptor(self):
        result = evaluate_aliases([row(0, 3, 3, 'a', 'b', 7)])
        self.assertEqual(result['pixel_changed_scene_static'], 1)
        self.assertEqual(result['scene_alias_groups'], 1)
        self.assertEqual(result['scene_changed_pixel_static'], 0)

    def test_different_scene_does_not_count_as_alias(self):
        result = evaluate_aliases([row(0, 3, 4, 'a', 'b', 1)])
        self.assertEqual(result['pixel_changed_scene_static'], 0)
        self.assertEqual(result['scene_alias_groups'], 0)

    def test_prequential_context_collision_not_called_nondeterminism(self):
        result = evaluate_aliases([
            row(0, 3, 4, 'a', 'b', 1),
            row(1, 3, 5, 'c', 'd', 2),
        ])
        self.assertEqual(result['same_scene_action_conflicts'], 1)
        self.assertEqual(result['scene_alias_groups'], 1)
        self.assertEqual(result['claim'], 'observational_diagnostic_not_hidden_state_or_nondeterminism')

    def test_no_cross_game_or_level_or_episode_alias(self):
        rows = [row(0, 3, 3, 'a', 'a', 0, game='g'),
                row(0, 3, 3, 'b', 'b', 0, game='h'),
                row(1, 3, 3, 'c', 'c', 0, game='h', level=1),
                row(0, 3, 3, 'd', 'd', 0, game='h', level=1)]
        result = evaluate_aliases(rows)
        self.assertEqual(result['scene_alias_groups'], 0)
        self.assertEqual(result['same_scene_action_conflicts'], 0)

    def test_rejects_hash_pixel_inconsistency(self):
        with self.assertRaises(ValueError):
            evaluate_aliases([row(0, 3, 3, 'a', 'a', 1)])
        with self.assertRaises(ValueError):
            evaluate_aliases([row(0, 3, 3, 'a', 'b', 0)])

    def test_rejects_missing_or_malformed_evidence(self):
        missing = row(0, 3, 3, 'a', 'a', 0)
        del missing['before_frame_sha256']
        with self.assertRaises(ValueError):
            evaluate_aliases([missing])
        bad = row(0, 3, 3, 'a', 'a', 0)
        bad['before_frame_sha256'] = 'not-a-sha'
        with self.assertRaises(ValueError):
            evaluate_aliases([bad])

    def test_level_progress_does_not_mix_scene_evidence(self):
        result = evaluate_aliases([
            row(0, 3, 3, 'a', 'b', 1, next_level=1),
            row(1, 3, 3, 'c', 'c', 0, level=1),
        ])
        self.assertEqual(result['same_level_records'], 1)
        self.assertEqual(result['scene_alias_groups'], 0)

    def test_empty_and_bounded(self):
        self.assertEqual(evaluate_aliases([])['records'], 0)
        with self.assertRaises(ValueError):
            evaluate_aliases([], max_records=0)
        with self.assertRaises(ValueError):
            evaluate_aliases([row(0, 3, 3, 'a', 'a', 0)] * 2, max_records=1)


if __name__ == '__main__':
    unittest.main()
