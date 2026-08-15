# MondayID Organism Verification

Build date: 2026-08-15

## Proven properties

- The genome remains stable across ChatGPT, Claude, Gemini, API, and local hosts.
- The append-only ledger detects tampering and recovers its canonical head.
- Invalid mutations are rejected; valid mutations produce a traceable delta.
- Secret values remain outside the portable genome.
- Host discovery and organ dependency closure pass in an isolated bootstrap.
- The runtime compiles and all six organism tests pass without third-party packages.

## Reproduction

```bash
cd platform/seed
python -m compileall mondayid_seed tests
python -m unittest discover -s tests -v
canary="$(mktemp -d)"
PYTHONPATH=. python -m mondayid_seed.cli --root "$canary" init
PYTHONPATH=. python -m mondayid_seed.cli --root "$canary" bootstrap --host chatgpt
PYTHONPATH=. python -m mondayid_seed.cli --root "$canary" self-test
```

The workflow `.github/workflows/seed-verification.yml` repeats this proof on every
Seed change. Hosting, billing, private credentials, Apple signing, physical-device
installation, and intentional merge remain external human-controlled gates; none
is required for the organism's identity, mutation safety, or local operation.

## Release artifact

- Library: `/MONDAYID_ORGANISM_SEED_CHATGPT_2026-08-15.zip`
- Library ID: `libfile_26d8e7703cd48191964327413a870ffe`
- Archive SHA-256: `00731e32620b3554bc03acbe4fceb361771a463cc252c4fd10f1887d8554a232`
- Genome SHA-256: `bdc3867cad6dba40817587a590d55485d1628d0c6805cc2484e02791a5fd9a01`
- Ledger head: `470c5d51504eef84f3bbb0f84c1c90d8235f9ae270fb14b84b90bb707b43cc3f`
