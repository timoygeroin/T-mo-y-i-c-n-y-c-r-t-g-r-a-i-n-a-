"""UL005 test-first: late spatial refinement, isolated public research only."""
from __future__ import annotations
import sys
import types
from pathlib import Path
import unittest
from test_agent import MyAgent as Frozen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from click_late_refinement_variant import generate
from click_stagnation_variant import generate as stagnation_generate

SOURCE = (ROOT / "agent" / "my_agent.py").read_text()

def load(src, name):
    module = types.ModuleType(name)
    exec(compile(src, "<"+name+">", "exec"), module.__dict__)
    return module.MyAgent

def row96():
    source = stagnation_generate(SOURCE)
    assert source.count("self._steps >= 128") == 1
    return load(source.replace("self._steps >= 128", "self._steps >= 96", 1), "row96")

class LateRefinementTests(unittest.TestCase):
    def test_frozen_agent_unchanged(self):
        self.assertEqual(Frozen.MAX_ACTIONS, 500)
        self.assertNotIn("late spatial refinement", SOURCE)

    def test_pre_gate_matches_row96(self):
        Row, Refine = row96(), load(generate(SOURCE), "refine")
        grid = [[0]*64 for _ in range(64)]
        for steps in (95, 96, 128, 256, 383):
            a,b=Row(game_id="unknown"),Refine(game_id="unknown")
            a._click_only=b._click_only=True
            a._steps=b._steps=steps
            key=a._key(0,[grid])
            self.assertEqual(a._pick_click(key,[grid]),b._pick_click(key,[grid]))

    def test_late_gate_introduces_new_physical_click(self):
        Row, Refine = row96(), load(generate(SOURCE), "refine")
        grid = [[0]*64 for _ in range(64)]
        a,b=Row(game_id="unknown"),Refine(game_id="unknown")
        a._click_only=b._click_only=True
        a._steps=b._steps=384
        key=a._key(0,[grid])
        original=a._pick_click(key,[grid])
        changed=b._pick_click(key,[grid])
        self.assertNotEqual(original,changed)
        self.assertEqual(changed,(min(63,original[0]+2),min(60,original[1]+2)))

    def test_source_guard_and_determinism(self):
        generated=generate(SOURCE)
        self.assertEqual(generated,generate(SOURCE))
        self.assertIn("self._steps >= 384",generated)
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("MAX_CLICKS = 80","MAX_CLICKS = 79"))

if __name__=="__main__":
    unittest.main()
