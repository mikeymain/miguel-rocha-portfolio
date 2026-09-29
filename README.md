# Miguel Rocha: Selected Projects

Practical projects in web development, browser extensions and Blender vehicle modding.
Based in Lisbon, Portugal. Looking for junior developer roles and technology internships in Lisbon or remotely.

[![CI](https://github.com/mikeywikey-coding/miguel-rocha-portfolio/actions/workflows/ci.yml/badge.svg)](https://github.com/mikeywikey-coding/miguel-rocha-portfolio/actions/workflows/ci.yml)

## Featured work

| Project                                                      | What it does                                                             | Main skills                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| [Build Lab](projects/build-lab/)                             | NBA 2K27 build planning, linked attributes, saved builds and comparisons | React, JavaScript, state management, automated tests     |
| [Workout Tracker](projects/workout-tracker/)                 | Logs training, tracks progress and stores workout history                | JavaScript, responsive UI, PWA, local storage            |
| [Travian Settlement Planner](extensions/settlement-planner/) | Estimates when culture points reach settlement thresholds                | Data parsing, forecasting, event simulation              |
| [TravAlarm](extensions/travalarm/)                           | Tracks game events and schedules browser/audio alerts                    | Manifest V3, service workers, Chrome APIs                |
| [Travian QoL](extensions/travian-qol/)                       | Configurable interface improvements and planning tools                   | Modular JavaScript, DOM integration, persistent settings |
| [Travian Night Mode](extensions/night-mode/)                 | Persistent dark theme for dynamically changing pages                     | CSS, MutationObserver, preference synchronisation        |
| [BMW M4 ADRO Kit](projects/bmw-m4-adro/)                     | Published Forza Horizon 6 vehicle mod with two body variants             | Blender, 3D modelling, game modding                      |

![Build Lab interface](assets/build-lab.png)

## Where to start

- **Build Lab** for React component design, calculation logic and browser testing.
- **The extension folders** for browser integration and Manifest V3.

Each project has its own README covering what it does, how the source is organised and how to run it. Applications live under `projects/`; browser extensions live under `extensions/`.

## Quality checks

Every push runs [CI](.github/workflows/ci.yml): ESLint and Prettier across the repository, unit tests for every project, and Build Lab's production build and Playwright browser tests. To run the same checks locally:

```sh
npm ci
npm run lint && npm run format:check && npm test
```

See [docs/VALIDATION.md](docs/VALIDATION.md) for what the tests cover and what still needs a manual check.

## Scope and attribution

Game projects are independent fan projects, not official products. Build Lab includes externally sourced rule data and game-related artwork; see [sources and attribution](ATTRIBUTION.md) and its documented accuracy limitations. M4 downloads are hosted on Nexus Mods, not copied into this repository.

No blanket open-source licence is asserted for third-party assets.
