# 冷兵器对战 (LBQ3) — Project Guidelines

## Quick Reference

- **Tech stack:** Vite 6.x + HTML5 Canvas 2D + Vanilla JS ES Modules (no framework)
- **Language:** JavaScript (no TypeScript), Chinese comments and UI text
- **Design doc:** See [readme.md](../readme.md) for full combat mechanics and game parameters

## Build and Test

```bash
npm run dev        # Vite dev server (auto-opens browser, WS on :3000)
npm run build      # Production bundle → dist/
npm run preview    # Preview built output
npm run server     # Standalone WebSocket server

# Headless combat testing (fast, no rendering)
node test-runner.js --rounds 200 --diffA 5 --diffB 5 --json
node test-runner.js --rounds 50 --detail   # Per-round breakdown
```

## Architecture

```
src/
  main.js              # Entry: menu routing, app state, NN weight loading
  combat/
    fighter.js         # Fighter class — state machine (idle/attack/block/dodge/stagger/parryCounter/death)
    player.js          # Player: wraps Fighter with keyboard/mouse/gamepad input
    combat-system.js   # Hit/clash/block resolution each frame
  weapons/
    weapon-defs.js     # 5 weapon definitions (dao/daggers/hammer/spear/shield)
    armor-defs.js      # 5 armor tiers (none/light/medium/heavy/plate)
  ai/
    ai-config.js       # buildAIConfig(difficulty) → parameter object (D1–D7, D99)
    ai-plans.js        # HTN planner for multi-step AI strategies
    enemy.js           # Enemy: wraps Fighter with AI decision logic
    weapon-ai-plugins.js # Weapon-specific AI decision trees
  core/
    constants.js       # ALL base game constants (HP, stamina, timings, ranges, damage)
    input.js           # Keyboard/mouse state manager
    gamepad-input.js   # Gamepad polling (Xbox button mapping)
    touch-input.js     # Mobile virtual joystick + buttons
    camera.js          # Viewport zoom/pan + screen shake
    audio.js           # Web Audio API procedural sound effects
    names.js           # Chinese name/title generator (100+ surnames, 200+ titles)
    utils.js           # Geometry helpers (dist, angleBetween, isInArc, etc.)
  game/
    game.js            # Game loop, mode management (pvai/spectate/test/jianghu/tutorial/online/arena/horseracing/sect/local2p/chainKill)
    arena-mode.js      # 武林大会: 16-person elimination tournament with betting
    horse-racing-mode.js # 田忌赛马: strategic 3v3 team battles
    jianghu-mode.js    # 江湖行 PvE campaign logic (mixin)
    jianghu-stages.js  # PvE campaign stage definitions
    tutorial-mode.js   # Step-by-step tutorial with guided sub-tasks
    sect-mode.js       # 宗门风云: sect management sim main logic
    sect-data.js       # Sect data tables (buildings, disciples, traits, quests)
    sect-ui.js         # Sect mode Canvas UI renderer
    sect-save.js       # Sect save/load system (3 slots + auto-save)
    sect-dialogues.js  # Dialogue generator
    sect-dialogues-combat.js # Combat dialogue lines
    sect-dialogues-life.js   # Life/training dialogue lines
    sect-achievements.js     # Sect achievement system
    effects.js         # Floating text, screen flash, hit freeze, time scale
    event-log.js       # Combat event → UI/visual mapping
    settings-panel.js  # Settings panel (zoom/volume/key bindings)
    test-mode.js       # Auto test mode (statistics + rendering)
  render/
    renderer.js        # Canvas 2D: fighters as colored circles + facing indicators
    particles.js       # Hit sparks, clash effects
    state-effects.js   # Visual feedback tied to fighter states
  nn/
    nn-agent.js        # Feedforward NN [26→64→32→8] for "武圣" AI
    browser-train.js   # REINFORCE training loop in browser
  net/
    net-client.js      # WebSocket client
    net-sync.js        # Fighter snapshot serialization for online play
  ui/
    menu.js            # Multi-page menu (main/pvai/spectate/test/wusheng/arena/horseracing/sect/local2p)
    ui.js              # In-game HUD (HP bars, stamina, qi, event log, settings)
server/
  server.js            # Standalone WebSocket server (also embedded in vite.config.js plugin)
  rooms.js             # Room manager: create/join/relay/leave protocol
```

### Key Design Decisions

- **Fighter is a shared base class** used by both Player and Enemy — identity is determined by context, not inheritance
- **State machine pattern:** `fighter.state` + `fighter.setState(newState, params)` drives all combat behavior
- **Timer pattern:** `this.timer -= dt; if (this.timer <= 0) { ... }` throughout combat logic
- **Attack phases:** Every attack has `phase: 'startup' | 'active' | 'recovery'`
- **Hit dedup:** `fighter.hasHit = new Set()` prevents duplicate hits in the same attack

## Conventions

- Import constants as namespace: `import * as C from '../core/constants.js'`, reference as `C.MAX_HP`
- All game parameters live in `constants.js` — never hardcode numbers in combat/AI logic
- AI difficulty parameters go in `ai-config.js` via `buildAIConfig(difficulty)`
- Use `getCommands()` pattern: Player and Enemy both return a command object each frame

## Version Bumping

Every time you modify source code under `src/`, bump the patch version in `src/ui/menu.js`:
```js
const GAME_VERSION = 'v0.8.x';  // ← increment the patch number
```
- Only bump once per task, not per file edit
- Use semantic versioning: patch for fixes/tweaks, minor for new features/modes

## Combat Balance Tuning

When adjusting combat parameters, use the `test-then-feedback` skill for the diagnostic workflow. Key thresholds:
- Win rate balance: 40–60% between same-difficulty AIs
- Average fight duration: 8–25 seconds
- See [.github/skills/test-then-feedback/SKILL.md](skills/test-then-feedback/SKILL.md) for full methodology

## Post-Change Testing

Every time you modify files under `src/combat/`, `src/ai/`, or `src/core/constants.js`, run a headless balance test before finishing:
```bash
node test-runner.js --rounds 200 --diffA 5 --diffB 5 --json
```
- Verify win rate stays within 40–60%
- Verify average duration stays within 8–30s
- If metrics drift out of range, diagnose and fix before committing

## Gotchas

- **Canvas DPI:** Canvas has custom props `._dpr`, `._logicW`, `._logicH` for DPI-aware rendering — don't bypass these
- **Headless tests** mock `particles` and `camera` with no-ops (see `test-runner.js`)
- **Vite dev server** auto-starts a WebSocket server on port 3000 via plugin — don't start a second one manually
- **Spectate/test mode** sets `combat.playerFighter = null` so camera/effects apply to all fighters
- **`perfectDodgeChance`** on fighters is set per-difficulty by AI config, not a global constant
