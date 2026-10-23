# Replay regressions

Checkpoints from live hill-climb journeys, stored as small normalized fixtures and
replayed through the production guidance (`nextSteps`, `progress`, `isSolved`,
`dialogueUnlocked`, `visibleTiers`). They run anywhere: no Windows, DOSBox or game
files. The live journeys in `scripts/hillclimb/` stay the source of truth; keep a
small set of them passing and turn verified checkpoints into fixtures.

## A fixture
- `state`: only the party fields the guidance reads; members are always named `Avatar`.
- `knowledge`: the player's spoiler level, revealed hint tiers and visited towns.
- `expect`: outcomes **checked against the game**, not copied from today's output.
- `verifiedLive`: where the checkpoint was verified (journey and checkpoint, or how it was derived).

Every fixture is also checked at all three spoiler levels: no hint text with hints
off, only nudges at "nudges", and never a clue or answer in the suggestions.

## Adding one
1. Run a journey to the checkpoint with the test companion (`npm run dev:test`).
2. `npx tsx scripts/replay/capture.ts <name> "<journey> checkpoint <tag>"` writes a skeleton.
3. Fill in `expect` from what you verified in the game, review the file (no paths,
   keys or player names), and run `npm test`.
