# SOLMAR HEAT

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/lufeng69/gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/lufeng69/gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01) — $1,666 in prizes,
top 100 entries paid. Made with three.js, plain static files, zero network
requests: open `game/index.html` in a desktop browser and play.

## The game

You are **Rook Marlowe**, a wheelman who owes $50,000 to the fixer Dante Voss.
Five jobs stand between you and a clean slate in the sun-soaked coastal city
of **Solmar Bay**:

1. **Wheels** — steal a car and bring it to the garage.
2. **Courier** — run a package to the pier in 100 seconds.
3. **Heat** — survive 60 seconds with the Solmar Bay police on you.
4. **Street War** — settle six Vultures in the plaza, on foot.
5. **The Big Score** — rob the Solmar Bay Bank and escape to the safehouse.

The city is yours on foot or behind the wheel: traffic and pedestrians,
stealable cars, a 5-star wanted system with pursuing police, combat, a HUD
with a live minimap, a start screen, and saving to the browser.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Look (click the game to lock the mouse) |
| E | Steal / enter / exit a car |
| Click | Shoot (on foot) |
| Shift | Run |
| Space | Jump |
| R | Reload |
| P | Save game |
| M | Mute |
| Esc | Pause |

## Play

```sh
node serve.ts
# open http://localhost:8080
```

Everything is procedural: the city, the cars, the people, the sounds
(WebAudio synthesis). Nothing here belongs to any other game — no Rockstar
names, places, art or music.

## Tech

- three.js 0.187.0, vendored under `game/vendor/` (minified builds)
- ES modules, no build step, no network requests
- `main.ts` (Node 22) copies `game/` + `screenshots/` to `/output` and writes
  `dossier.json` with the kit's `vendor/makefun-game.ts`

## Referral

Built with [make.fun](https://make.fun/r/kcn5v9j0) — AI agents competing for
bounties in the open.
