"""Test-first: adaptive local click follow-up after click-only stagnation.
All fixtures are synthetic; official 25-game A/B is a separate gate.
"""
from __future__ import annotations
import sys
import types
import unittest
from pathlib import Path
from test_agent import FrameData, GameAction, MyAgent as Frozen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from click_causal_refinement_variant import generate

SOURCE = (ROOT / "agent" / "my_agent.py").read_text()

def candidate(mode="near"):
    module=types.ModuleType("click_causal_"+mode)
    exec(compile(generate(SOURCE, mode=mode), "<click-causal-"+mode+">", "exec"), module.__dict__)
    return module.MyAgent

def obs(level=0, mixed=False):
    grid=[[0]*64 for _ in range(64)]
    for y,x in ((12,12),(30,30),(44,44)):
        grid[y][x]=2
    actions=[GameAction.ACTION1,GameAction.ACTION6] if mixed else [GameAction.ACTION6]
    return FrameData(frame=[grid],available_actions=actions,levels_completed=level)

class CausalClickRefinementTests(unittest.TestCase):
    def test_pre_gate_same_physical_click_as_frozen(self):
        baseline=Frozen(game_id="synthetic")
        treated=candidate()(game_id="synthetic")
        frame=obs()
        for _ in range(24):
            a=baseline.choose_action([],frame)
            b=treated.choose_action([],frame)
            self.assertEqual(a.name,b.name)
            self.assertEqual(baseline._last_position,treated._last_position)
            self.assertFalse(treated._click_only)

    def test_gate_requires_stagnant_click_only_first_level(self):
        for level,mixed,steps,expected in [(0,False,96,True),(0,False,95,False),(1,False,200,False),(0,True,200,False)]:
            a=candidate()(game_id="synthetic")
            a._steps=steps
            a.choose_action([],obs(level,mixed))
            self.assertEqual(a._click_only,expected)

    def test_near_mode_follows_observed_responsive_coordinate(self):
        a=candidate("near")(game_id="synthetic")
        a._steps=96
        a._click_successes[(0,30,30)]=2
        a.choose_action([],obs())
        self.assertTrue(a._click_only)
        self.assertIn(a._last_position,{(32,30),(28,30),(30,32),(30,28),(34,30),(26,30),(30,34),(30,26)})

    def test_far_negative_control_uses_distinct_physical_probe(self):
        near=candidate("near")(game_id="synthetic")
        far=candidate("far")(game_id="synthetic")
        for a in (near,far):
            a._steps=96
            a._click_successes[(0,30,30)]=2
            a.choose_action([],obs())
        self.assertNotEqual(near._last_position,far._last_position)

    def test_unresponsive_click_does_not_create_false_focus(self):
        a=candidate()(game_id="synthetic")
        a._steps=96
        a._click_successes[(0,30,30)]=1
        a._click_failures[(0,30,30)]=3
        a.choose_action([],obs())
        self.assertNotIn(a._last_position,{(32,30),(28,30),(30,32),(30,28)})

    def test_source_guard_and_modes(self):
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("MAX_CLICKS = 80","MAX_CLICKS = 79"))
        with self.assertRaises(ValueError):
            generate(SOURCE,mode="other")

if __name__ == "__main__":
    unittest.main()
