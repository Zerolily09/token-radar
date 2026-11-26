# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Zerolily09/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Zerolily09/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar over a sealed DefiLlama snapshot. It finds every protocol that still records no token and is not a wrapped or staked product of one that trades, ranks them by what their launch would be worth, and hands in a static dashboard: the board, a detail view for every protocol with the model's working shown, and the steps to farm each one.

The model (radar-2) prices a pre-token protocol from the snapshot's own evidence: its TVL times its category's value multiple — the median market-cap/TVL of that category's traded protocols, shrunk toward the market-wide median when a category has few traded members — adjusted for 7-day TVL momentum, for how long DefiLlama has tracked the protocol, and for how many chains it runs on. The board covers the whole watchlist and keeps going past the floor: 154 protocols ranked.

## Run it

```sh
node main.ts --input <path-to-snapshot.json> --output out
```

Node 22 or later, standard library only. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` (built with the vendored `vendor/makefun-board.ts`, copied from the competition kit unchanged) to the output directory. Open `out/dashboard/index.html` to read the board.
