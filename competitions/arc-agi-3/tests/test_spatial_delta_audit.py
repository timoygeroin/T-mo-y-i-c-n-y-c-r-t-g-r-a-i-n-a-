"""Pre-registered spatial diagnostic: fixed 8px edge band and 8x8 tiles.

Synthetic contract tests only; do not infer HUD or game causality from edge pixels.
"""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from spatial_delta_audit import pixel_delta_regions, audit_spatial


def frame(changes=()):
    grid = [[0] * 64 for _ in range(64)]
    for x, y in changes:
        grid[y][x] = 3
    return grid


def trace(turn, before, after, regions, *, level=0, next_level=None, game='g'):
    return {
        'schema': 'arc-agi3.shadow-transition.v1', 'game_id': game,
        'turn': turn, 'action_key': 'ACTION1',
        'level_before': level, 'level_after': level if next_level is None else next_level,
        'before_scene': [[3, 1, before, 4, before, 4]],
        'after_scene': [[3, 1, after, 4, after, 4]],
        'legal_actions': ['ACTION1'],
        'before_frame_sha256': 'a' * 64,
        'after_frame_sha256': ('a' if regions['total_changes'] == 0 else 'b') * 64,
        'pixel_changes': regions['total_changes'],
        'spatial_delta': regions,
    }


class SpatialDeltaTests(unittest.TestCase):
    def test_edge_only_one_tile(self):
        result = pixel_delta_regions(frame(), frame([(0, 0), (7, 7)]))
        self.assertEqual(result['total_changes'], 2)
        self.assertEqual(result['border_changes'], 2)
        self.assertEqual(result['interior_changes'], 0)
        self.assertEqual(result['changed_tiles'], [[0, 0, 2]])

    def test_interior_only(self):
        result = pixel_delta_regions(frame(), frame([(8, 8), (55, 55)]))
        self.assertEqual(result['border_changes'], 0)
        self.assertEqual(result['interior_changes'], 2)
        self.assertEqual(result['changed_tiles'], [[1, 1, 1], [6, 6, 1]])

    def test_mixed_and_corner_no_double_count(self):
        result = pixel_delta_regions(frame(), frame([(0, 63), (32, 32), (63, 0)]))
        self.assertEqual(result['total_changes'], 3)
        self.assertEqual(result['border_changes'], 2)
        self.assertEqual(result['interior_changes'], 1)

    def test_no_change(self):
        result = pixel_delta_regions(frame(), frame())
        self.assertEqual(result['total_changes'], 0)
        self.assertEqual(result['changed_tiles'], [])

    def test_rejects_shape_and_bad_pixels(self):
        with self.assertRaises(ValueError):
            pixel_delta_regions(frame(), [[0] * 63 for _ in range(64)])
        broken = frame()
        broken[1][1] = -1
        with self.assertRaises(ValueError):
            pixel_delta_regions(frame(), broken)

    def test_alias_edge_vs_interior_and_mixed(self):
        edge = pixel_delta_regions(frame(), frame([(0, 0)]))
        core = pixel_delta_regions(frame(), frame([(12, 12)]))
        both = pixel_delta_regions(frame(), frame([(0, 0), (12, 12)]))
        rows = [trace(0, 3, 3, edge), trace(1, 3, 3, core), trace(2, 3, 3, both)]
        result = audit_spatial(rows)
        self.assertEqual(result['alias_transitions'], 3)
        self.assertEqual(result['alias_border_only'], 1)
        self.assertEqual(result['alias_interior_only'], 1)
        self.assertEqual(result['alias_mixed'], 1)
        self.assertEqual(result['alias_border_changed_pixels'], 2)
        self.assertEqual(result['alias_interior_changed_pixels'], 2)

    def test_scene_changed_or_level_changed_not_alias(self):
        reg = pixel_delta_regions(frame(), frame([(1, 1)]))
        result = audit_spatial([trace(0, 3, 4, reg), trace(1, 3, 3, reg, next_level=1)])
        self.assertEqual(result['alias_transitions'], 0)
        self.assertEqual(result['same_level_records'], 1)

    def test_rejects_inconsistent_totals_and_tile_tampering(self):
        reg = pixel_delta_regions(frame(), frame([(1, 1)]))
        broken = dict(reg, border_changes=0)
        with self.assertRaises(ValueError):
            audit_spatial([trace(0, 3, 3, broken)])
        broken = dict(reg, changed_tiles=[[0, 0, 2]])
        with self.assertRaises(ValueError):
            audit_spatial([trace(0, 3, 3, broken)])

    def test_bounded_and_no_cross_game_aggregation_of_scene_keys(self):
        reg = pixel_delta_regions(frame(), frame([(1, 1)]))
        result = audit_spatial([trace(0, 3, 3, reg, game='a'), trace(0, 3, 3, reg, game='b')])
        self.assertEqual(result['alias_transitions'], 2)
        with self.assertRaises(ValueError):
            audit_spatial([trace(0, 3, 3, reg)] * 2, max_records=1)


if __name__ == '__main__':
    unittest.main()
