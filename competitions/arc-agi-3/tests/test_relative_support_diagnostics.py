"""Test-first contracts for read-only relative donor support diagnosis."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from remaining_public_sample import FROZEN_GAMES
from relative_support_diagnostics import diagnose_relative_support, PROTOCOL


def scene(x, color=2, anchor_x=30, duplicate=False):
    objects = [[color, 1, x, 2, x, 2], [5, 4, anchor_x, 30, anchor_x+1, 31]]
    if duplicate:
        objects.append([color+1, 1, x+2, 2, x+2, 2])
    return objects


def row(game, before, after, action="ACTION1"):
    return dict(schema="arc-agi3.shadow-transition.v1", game_id=game,
                turn=0, action_key=action, legal_actions=["ACTION1", "ACTION6"],
                level_before=0, level_after=0,
                before_scene=before, after_scene=after)


def fixture(second_delta=1, target_delta=0, duplicate=False, donor_action="ACTION1"):
    rows = []
    for i, game in enumerate(FROZEN_GAMES):
        if i in (0, 1):
            color = 2+i
            before = scene(3, color)
            dx = 1 if i == 0 else second_delta
            rows.append(row(game, before, scene(3+dx, color), donor_action))
        elif i == 2:
            rows.append(row(game, scene(12, 7, duplicate=duplicate),
                            scene(12+target_delta, 7, duplicate=duplicate)))
        else:
            before = [[8, 4, 2, 2, 3, 3]]
            rows.append(row(game, before, before))
    return rows


class RelativeSupportDiagnosticTests(unittest.TestCase):
    def test_two_independent_donors_have_strict_target_overlap(self):
        report = diagnose_relative_support(fixture())
        self.assertEqual(report["protocol"], PROTOCOL)
        self.assertEqual(report["total"]["same_level"], 9)
        self.assertEqual(report["total"]["unit_cardinal_moves"], 2)
        self.assertEqual(report["support"]["multi_donor_movement_keys"], 1)
        self.assertEqual(report["per_game"][FROZEN_GAMES[2]]["strict_target_key_overlap"], 1)
        self.assertEqual(report["effect_on_agent"], "NONE_SHADOW_ONLY")

    def test_nonunit_motion_is_counted_and_excluded(self):
        report = diagnose_relative_support(fixture(second_delta=2))
        self.assertEqual(report["total"]["nonunit_moves"], 1)
        self.assertEqual(report["total"]["unit_cardinal_moves"], 1)
        self.assertEqual(report["support"]["multi_donor_movement_keys"], 0)
        self.assertEqual(report["per_game"][FROZEN_GAMES[2]]["strict_target_key_overlap"], 0)

    def test_ambiguous_target_role_blocks_matching_not_donor_learning(self):
        report = diagnose_relative_support(fixture(duplicate=True, target_delta=1))
        self.assertGreater(report["total"]["role_rejections"].get("area_rank_ambiguous", 0), 0)
        self.assertEqual(report["support"]["multi_donor_movement_keys"], 1)
        self.assertEqual(report["per_game"][FROZEN_GAMES[2]]["strict_target_key_overlap"], 0)

    def test_static_witness_vetoes_movement_consensus(self):
        report = diagnose_relative_support(fixture(second_delta=0))
        self.assertEqual(report["support"]["conflicted_movement_keys"], 1)
        self.assertEqual(report["per_game"][FROZEN_GAMES[2]]["weak_target_key_overlap"], 0)
        self.assertEqual(report["per_game"][FROZEN_GAMES[2]]["strict_target_key_overlap"], 0)

    def test_target_outcome_does_not_train_its_own_donors(self):
        a = diagnose_relative_support(fixture(target_delta=0))
        b = diagnose_relative_support(fixture(target_delta=1))
        target = FROZEN_GAMES[2]
        self.assertEqual(a["per_game"][target]["strict_target_key_overlap"],
                         b["per_game"][target]["strict_target_key_overlap"])
        self.assertEqual(a["per_game"][target]["strict_target_key_overlap"], 1)

    def test_frozen_roster_validation_fails_closed(self):
        with self.assertRaises(ValueError):
            diagnose_relative_support(fixture()[:-1])


if __name__ == "__main__":
    unittest.main()
