"""Offline comparison of repeated ARC-AGI-3 public-game scorecards.

Input CSV columns: seed,agent,game,score,levels.
Requires paired game/seed rows for candidate and control. No Kaggle claims.
Usage: python tools/compare_scorecards.py candidate.csv
"""
import argparse
import csv
import math
from collections import defaultdict


def compare(rows, candidate="monday", control="random"):
    pairs = defaultdict(dict)
    for row in rows:
        key = (row["seed"], row["game"])
        agent = row["agent"]
        if agent not in (candidate, control):
            continue
        if agent in pairs[key]:
            raise ValueError(f"Duplicate observation: {key} {agent}")
        score = float(row["score"])
        if not math.isfinite(score):
            raise ValueError("Non-finite score")
        pairs[key][agent] = score
    if not pairs or any(set(v) != {candidate, control} for v in pairs.values()):
        raise ValueError("Missing paired candidate/control game-seed observations")
    deltas = [v[candidate] - v[control] for v in pairs.values()]
    n = len(deltas)
    mean = sum(deltas) / n
    variance = sum((x - mean) ** 2 for x in deltas) / (n - 1) if n > 1 else None
    return {"pairs": n, "mean_paired_delta": mean,
            "sample_sd": math.sqrt(variance) if variance is not None else None,
            "wins": sum(x > 0 for x in deltas),
            "ties": sum(x == 0 for x in deltas),
            "losses": sum(x < 0 for x in deltas)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    args = parser.parse_args()
    with open(args.csv_path, newline="", encoding="utf-8") as file:
        result = compare(csv.DictReader(file))
    for key, value in result.items():
        print(f"{key}: {value}")
    print("Local paired public-game analysis only; not a Kaggle leaderboard score.")


if __name__ == "__main__":
    main()
