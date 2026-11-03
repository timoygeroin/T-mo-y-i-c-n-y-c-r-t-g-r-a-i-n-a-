"""Test-first contracts for post-hoc nonunit donor-veto decomposition (shadow only)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from remaining_public_sample import FROZEN_GAMES
from nonunit_veto_diagnostics import diagnose_nonunit_veto, PROTOCOL


def scene(x, color=2):
    return [[color, 1, x, 2, x, 2], [5, 4, 30, 30, 31, 31]]


def row(game, before, after, action="ACTION1"):
    return dict(schema="arc-agi3.shadow-transition.v1", game_id=game,
                turn=0, action_key=action, legal_actions=["ACTION1", "ACTION6"],
                level_before=0, level_after=0,
                before_scene=before, after_scene=after)


def fixture(donor_deltas=(2, 2), donor_actions=("ACTION1", "ACTION1"),
            target_action="ACTION1", target_delta=0, target_single=False):
    rows = []
    for i, game in enumerate(FROZEN_GAMES):
        if i < 2:
            before = scene(3, 2+i)
            after = scene(3+donor_deltas[i], 2+i)
            rows.append(row(game, before, after, donor_actions[i]))
        elif i == 2:
            before = [[7, 1, 12, 2, 12, 2]] if target_single else scene(12, 7)
            after = [[7, 1, 12+target_delta, 2, 12+target_delta, 2]] if target_single else scene(12+target_delta, 7)
            rows.append(row(game, before, after, target_action))
        else:
            s = [[8, 4, 2, 2, 3, 3]]
            rows.append(row(game, s, s))
    return rows


class NonunitVetoTests(unittest.TestCase):
    def test_two_donors_and_matching_target_reach_strict_support(self):
        report = diagnose_nonunit_veto(fixture())
        target = report["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(report["protocol"], PROTOCOL)
        self.assertEqual(report["total"]["nonunit_cardinal_moves"], 2)
        self.assertEqual(report["total"]["role_eligible_moves"], 2)
        self.assertEqual(target["donor_nonzero_keys"], 1)
        self.assertEqual(target["target_action_level_overlap"], 1)
        self.assertEqual(target["target_exact_key_overlap"], 1)
        self.assertEqual(target["two_donor_rules"], 1)
        self.assertEqual(report["effect_on_agent"], "NONE_SHADOW_ONLY")

    def test_ambiguous_area_rank_rejects_nonunit_movement_role(self):
        rows = fixture()
        rows[0]["before_scene"] = [[2, 1, 3, 2, 3, 2], [6, 1, 30, 30, 30, 30]]
        rows[0]["after_scene"] = [[2, 1, 5, 2, 5, 2], [6, 1, 30, 30, 30, 30]]
        report = diagnose_nonunit_veto(rows)
        self.assertEqual(report["total"]["role_rejections"].get("area_rank_ambiguous"), 1)
        self.assertEqual(report["total"]["role_eligible_moves"], 1)
        self.assertEqual(report["per_game"][FROZEN_GAMES[2]]["two_donor_rules"], 0)

    def test_exact_action6_coordinates_do_not_overlap(self):
        rows = fixture(donor_actions=("ACTION6@1,2", "ACTION6@1,2"),
                       target_action="ACTION6@7,8")
        target = diagnose_nonunit_veto(rows)["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["donor_nonzero_keys"], 1)
        self.assertEqual(target["target_action_level_overlap"], 0)
        self.assertEqual(target["target_exact_key_overlap"], 0)

    def test_role_mismatch_after_action_overlap(self):
        rows = fixture(target_single=True)
        target = diagnose_nonunit_veto(rows)["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["target_action_level_overlap"], 1)
        self.assertEqual(target["target_exact_key_overlap"], 0)

    def test_static_or_conflicting_donor_veto_remains(self):
        for deltas in ((2, 0), (2, 3)):
            with self.subTest(deltas=deltas):
                target = diagnose_nonunit_veto(fixture(donor_deltas=deltas))["per_game"][FROZEN_GAMES[2]]
                self.assertEqual(target["two_donor_rules"], 0)
                self.assertEqual(target["one_donor_rules"], 0)

    def test_target_outcome_never_changes_heldout_donor_support(self):
        a = diagnose_nonunit_veto(fixture(target_delta=0))["per_game"][FROZEN_GAMES[2]]
        b = diagnose_nonunit_veto(fixture(target_delta=2))["per_game"][FROZEN_GAMES[2]]
        for key in ("donor_nonzero_keys", "target_action_level_overlap",
                    "target_exact_key_overlap", "one_donor_rules", "two_donor_rules"):
            self.assertEqual(a[key], b[key])

    def test_invalid_frozen_roster_fails_closed(self):
        with self.assertRaises(ValueError):
            diagnose_nonunit_veto(fixture()[:-1])


if __name__ == "__main__":
    unittest.main()
