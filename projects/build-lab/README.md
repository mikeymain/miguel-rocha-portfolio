# Build Lab

A React planner for NBA 2K27 player builds, with linked attribute changes, saved-build comparisons and an undoable editing workflow.

**Stack:** React 19, JavaScript, Vite, Playwright, Node.js test runner.

![Build Lab](../../assets/build-lab.png)

## Features

- Attribute editing with locks, linked attribute rules and atomic undo.
- Body settings, badge requirements and cap-breaker planning.
- Saved builds, side-by-side comparisons, shareable links and image exports.
- Responsive attribute lanes that reflow with the editor's width (CSS container queries).
- Build Finder: set the ratings you want after cap breakers and search every legal body in a height range. Targets can be Must or best effort, set from a body's maximum or from a badge tier, cap breakers only go on Must targets, and target limits follow the other Musts (the latest edit wins). Results either spend your cap breaker budget or, with "Fewest needed", rank builds by the fewest cap breakers the targets need. Only bodies that can reach every Must are searched; when none can, the finder names the closest body and what it misses. When nothing qualifies it shows the closest builds. Searches run in a Web Worker and can be stopped.
- Screenshot import: the Import button reads a full 16:9 screenshot of the in-game MyCareer Attribute Upgrades screen (Tesseract.js, in the browser), fills in body, base ratings and ratings after cap breakers for review, then loads the build with matching cap breakers.
- Minimize caps: keep every after-cap rating with as few cap breakers as the overall budget allows.

## Run locally

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4173`. `npm run build` produces a static site in `dist/client/`.

## Tests

- `npm test` runs the calculation tests in `tests/*.test.mjs`: linked-attribute rules, cap projections, cost curves, locks, share links and the Build Finder.
- `npm run test:ui` starts the dev server and runs the Playwright browser tests in `tests/ui/`: editing flows, saved builds, layout at several widths and typography. It uses Playwright's Chromium; set `PLAYWRIGHT_CHANNEL=msedge` to use an installed Edge instead.

## Source guide

- `src/Builder.jsx` owns the application state and wires handlers to the components in `src/components/`.
- `src/storage.js` restores and saves the draft and the saved-build library, turning every storage failure into a user-facing notice.
- `src/engine/` holds the calculation logic: linked attributes, cap breakers, projections and the Build Finder search (`buildFinder.js`, `capSwap.js`, `badgeValue.js`, run off the page by `finderWorker.js`). It has no React dependency, so it is tested directly.
- `src/catalogs/` holds compiled badge, animation and takeover data.

## Accuracy

Game rules and data are externally sourced; this is not an official or fully verified reproduction of the game. See [feature parity](feature-parity.md) and the [dataset notes](research/nba2k27-builder-dataset/README.md). The linked-attribute table in `src/engine/linked-attributes.json` was extracted from a third-party builder and records its provenance.
