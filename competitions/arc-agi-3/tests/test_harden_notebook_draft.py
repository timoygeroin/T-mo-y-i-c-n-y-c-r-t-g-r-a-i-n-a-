"""Fail-fast notebook guard tests. No Kaggle execution or credentials."""
import importlib.util
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1] / "tools" / "harden_notebook_draft.py"
spec = importlib.util.spec_from_file_location("harden_notebook_draft", PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

INSTALL = ('!pip install --no-index --find-links \\\n'
           '    /kaggle/input/competitions/arc-prize-2026-arc-agi-3/arc_agi_3_wheels \\\n'
           '    arc-agi python-dotenv')
RERUN = ("import os\nif os.getenv('KAGGLE_IS_COMPETITION_RERUN'):\n"
         '    !curl --fail --retry 999 --retry-all-errors --retry-delay 5 \\\n'
         '          --retry-max-time 600 http://gateway:8001/api/games\n'
         '    !cp -r /kaggle/input/competitions/arc-prize-2026-arc-agi-3/ARC-AGI-3-Agents \\\n'
         '           /kaggle/working/ARC-AGI-3-Agents\n'
         '    !cp /tmp/my_agent.py \\\n'
         '        /kaggle/working/ARC-AGI-3-Agents/agents/templates/my_agent.py\n'
         '    !cd /kaggle/working/ARC-AGI-3-Agents && \\\n'
         '        MPLBACKEND=agg \\\n'
         '        python main.py --agent myagent\n')


def fixture():
    return {"metadata": {"kaggle": {"isInternetEnabled": False}}, "cells": [
        {"cell_type": "markdown", "source": "# Submission"},
        {"cell_type": "code", "source": INSTALL},
        {"cell_type": "code", "source": "%%writefile /tmp/my_agent.py\npass"},
        {"cell_type": "code", "source": RERUN},
        {"cell_type": "code", "source": "pass"}]}


class GuardTests(unittest.TestCase):
    def test_exact_shell_shape_and_python_syntax(self):
        notebook = module.harden_notebook(fixture())
        self.assertTrue(notebook["metadata"]["mondayid_fail_fast_shell_v1"])
        self.assertEqual(notebook["cells"][2]["source"], fixture()["cells"][2]["source"])
        for i in (1, 3):
            compile(notebook["cells"][i]["source"], "<test>", "exec")
            self.assertNotIn("!curl", notebook["cells"][i]["source"])
            self.assertNotIn("!pip", notebook["cells"][i]["source"])

    def test_install_failure_raises(self):
        code = module.harden_notebook(fixture())["cells"][1]["source"]
        with patch("subprocess.run", side_effect=subprocess.CalledProcessError(17, "pip")):
            with self.assertRaises(subprocess.CalledProcessError):
                exec(code, {})

    def test_gateway_failure_raises(self):
        code = module.harden_notebook(fixture())["cells"][3]["source"]
        with patch.dict(os.environ, {"KAGGLE_IS_COMPETITION_RERUN": "1"}):
            with patch("subprocess.run", side_effect=subprocess.CalledProcessError(22, "curl")):
                with self.assertRaises(subprocess.CalledProcessError):
                    exec(code, {})

    def test_agent_command_preserves_cwd_and_environment(self):
        code = module.harden_notebook(fixture())["cells"][3]["source"]
        with patch.dict(os.environ, {"KAGGLE_IS_COMPETITION_RERUN": "1"}):
            with patch("subprocess.run") as run:
                exec(code, {})
        self.assertEqual(run.call_count, 4)
        args, kwargs = run.call_args
        self.assertEqual(args[0], ["python", "main.py", "--agent", "myagent"])
        self.assertEqual(kwargs["cwd"], "/kaggle/working/ARC-AGI-3-Agents")
        self.assertEqual(kwargs["env"]["MPLBACKEND"], "agg")
        self.assertTrue(all(call.kwargs["check"] for call in run.call_args_list))

    def test_unrecognized_command_fails_closed(self):
        data = fixture()
        data["cells"][3]["source"] = RERUN.replace("!curl", "!wget")
        with self.assertRaisesRegex(ValueError, "unrecognized"):
            module.harden_notebook(data)

    def test_missing_command_fails_closed(self):
        data = fixture()
        data["cells"][3]["source"] = RERUN.replace("!cp /tmp/my_agent.py", "cp /tmp/my_agent.py")
        with self.assertRaisesRegex(ValueError, "upstream shell shape"):
            module.harden_notebook(data)

    def test_unexpected_structure_fails_closed(self):
        data = fixture()
        data["cells"].pop()
        with self.assertRaisesRegex(ValueError, "structure"):
            module.harden_notebook(data)

    def test_second_hardening_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "upstream shell shape"):
            module.harden_notebook(module.harden_notebook(fixture()))


if __name__ == "__main__":
    unittest.main()
