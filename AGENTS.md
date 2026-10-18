# Agent instructions

This repo's agent playbook is [CLAUDE.md](CLAUDE.md): commands, layout, game-data facts, the headless play-test driver, hill-climb journeys and the DOSBox memory map. Read it before changing anything. The team workflow is in [CONTRIBUTING.md](CONTRIBUTING.md).

The essentials:
- Never commit Ultima IV game files; the game folder is read-only.
- Play-test only in a test instance (`npm run dev:test` or `scripts/driver/`, `scripts/hillclimb/`), never in someone's real game, and never kill a DOSBox a person launched.
- One play-test per machine at a time (the driver takes window focus; the test companion uses port 9241).
- Branch from `main` as `<handle>/<topic>`, one topic per PR, PRs target `main` (no stacked PRs). `npm run typecheck` and `npm test` must pass.
