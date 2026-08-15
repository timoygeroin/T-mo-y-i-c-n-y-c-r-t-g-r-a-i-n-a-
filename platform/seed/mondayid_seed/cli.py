from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .core import SeedError, SeedRuntime


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="mondayid-seed")
    root.add_argument("--root", default=".", help="project root containing .mondayid")
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("init")

    discover = commands.add_parser("detect")
    discover.add_argument("host", choices=["chatgpt", "claude", "gemini", "api", "local"])
    discover.add_argument("--descriptor", type=Path)

    express = commands.add_parser("express")
    express.add_argument("host", choices=["chatgpt", "claude", "gemini", "api", "local"])
    express.add_argument("--descriptor", type=Path)

    bootstrap = commands.add_parser("bootstrap")
    bootstrap.add_argument("host", choices=["chatgpt", "claude", "gemini", "api", "local"])
    bootstrap.add_argument("--descriptor", type=Path)

    test = commands.add_parser("self-test")
    test.add_argument("--host", choices=["chatgpt", "claude", "gemini", "api", "local"])
    test.add_argument("--descriptor", type=Path)

    objective = commands.add_parser("focus")
    objective.add_argument("objective")
    objective.add_argument("--backlog", nargs="*", default=[])

    mutation = commands.add_parser("propose-mutation")
    mutation.add_argument("file", type=Path)

    accept = commands.add_parser("accept-mutation")
    accept.add_argument("mutation_id")

    delta = commands.add_parser("export-delta")
    delta.add_argument("from_hash")
    delta.add_argument("output", type=Path)

    commands.add_parser("status")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    runtime = SeedRuntime(args.root)
    try:
        if args.command == "init":
            result = runtime.initialize()
        elif args.command == "detect":
            result = runtime.discover(args.host, args.descriptor)
        elif args.command == "express":
            result = runtime.express(args.host, args.descriptor)
        elif args.command == "bootstrap":
            result = runtime.bootstrap(args.host, args.descriptor)
        elif args.command == "self-test":
            result = runtime.self_test(args.host, args.descriptor)
        elif args.command == "focus":
            result = runtime.set_objective(args.objective, args.backlog)
        elif args.command == "propose-mutation":
            result = runtime.propose_mutation(json.loads(args.file.read_text(encoding="utf-8")))
        elif args.command == "accept-mutation":
            result = runtime.accept_mutation(args.mutation_id)
        elif args.command == "export-delta":
            result = runtime.export_delta(args.from_hash, args.output)
        else:
            result = runtime.recover()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except (SeedError, ValueError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

