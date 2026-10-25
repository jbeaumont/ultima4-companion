# Contributing

Several people, and their AI agents, work on this at once. These rules keep us out of each other's way and keep everyone's real Ultima IV saves safe.

## Setup
1. Install Node.js 24, Git and the GitHub CLI (`gh`), on Windows 10 or 11.
2. Install Ultima IV from GOG. If it isn't at `C:\Program Files\GOG Galaxy\Games\Ultima 4`, set `U4_DIR` to its folder.
3. Clone, then `npm install`, `npm test` (the real-install tests run only when the game is found) and `npm run dev`.
   `npm run dev` keeps its companion data in `%APPDATA%\ultima4-companion-dev`, apart from an installed copy (`ultima4-companion`) and test instances (`ultima4-companion-test`). It still reads your real game saves.

## Ground rules
- **Never commit game files.** `.gitignore` blocks the raw formats (`*.SAV`, `*.MAP`, `*.ULT`, `*.TLK`, `*.DNG`, `*.EGA`, ...). Small derived data in `data/` is fine.
- **The game folder is read-only.** The companion only writes saves through its guarded path (DOSBox closed, snapshot first, explicit confirmation).
- **Play-test in a test instance** (`npm run dev:test`, or the driver scripts), never in your real game. Never close or kill a DOSBox someone launched to play.
- Screenshots and captures go in a scratch folder, not the repo.

## Workflow
1. **Pick an issue** and assign yourself (or comment) so nobody duplicates it. For new ideas, open an issue first.
2. **Branch from `main`**: `<your-handle>/<short-topic>`, e.g. `sam/shrine-tips`.
3. Keep PRs to one topic. Before opening one: `npm run typecheck` and `npm test` pass, and if you changed what the companion shows, run the relevant journey in `scripts/hillclimb/`.
4. **Open the PR against `main`.** Don't stack PRs on other PRs: merging a stacked PR lands it in its parent branch, not `main`. If you depend on unmerged work, wait for it, or base on it and retarget once it lands.
5. CI (typecheck + tests) must be green. Merge with a merge commit after review; delete the branch.

## For AI agents
- [CLAUDE.md](CLAUDE.md) is the agent playbook: commands, layout, game-data facts, the play-test driver, hill-climb journeys and memory map. [AGENTS.md](AGENTS.md) points other tools to the same place.
- Work in your own clone or worktree, on your own branch. Never push to `main`.
- **One play-test per machine at a time.** The driver brings the test DOSBox to the front with a real mouse click, and the test companion always uses port 9241. Two agents driving games on one PC will fight over focus.
- Verify claims in the game: a journey or scenario that passes beats a guess. Check rules against u4-decompiled or xu4 rather than memory.
- Say what you couldn't verify in your PR description.

## Ways to help
- **Hill-climb**: write a journey that plays part of the game (see `scripts/hillclimb/`), see what the companion gets wrong or doesn't show, and fix it.
- **Play**: play normally with the companion open and file issues with where you were and what you expected.
- **Lore and hints**: hints live in `src/domain/hints.ts`; every claim should be checked against the game data.
