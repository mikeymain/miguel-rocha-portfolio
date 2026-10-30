![Miguel Rocha — Customer support and practical software projects](assets/portfolio-header.svg)

# Building tools for everyday problems

I'm **Miguel Rocha**, based in Lisbon, with customer-support experience at Teleperformance and Majorel. I'm looking for **customer or technical support roles in Lisbon or remotely**, bringing clear communication in Portuguese and English (C2), troubleshooting skills and hands-on experience building software.

[Start here](#start-here) · [All projects](#all-projects) · [Reviewer guide](docs/REVIEWER-GUIDE.md) · [Validation](docs/VALIDATION.md)

[![CI](https://github.com/mikeymain/miguel-rocha-portfolio/actions/workflows/ci.yml/badge.svg)](https://github.com/mikeymain/miguel-rocha-portfolio/actions/workflows/ci.yml)

## Start here

### 01 / PC Remote

**Control a Windows PC from a phone on the local network.**

A phone interface for a trackpad, keyboard, hotkeys, media and volume controls, backed by a Python server. Devices pair with a PIN and reconnect using individual tokens.

`Python` `JavaScript` `WebSockets` `Windows integration` `pytest`

- **Practical focus:** responsive phone controls, connection recovery and straightforward device pairing.
- **Implementation:** input validation, host and origin checks, rate limiting and tests that replace the real Windows input layer.
- **Scope:** designed for a trusted local network; see the project's security notes before use.

[Explore PC Remote →](projects/pc-remote/)

---

### 02 / Hypertrophy

**Record workouts and review progress, including offline.**

Hypertrophy builds a training programme around the user's equipment and experience, logs sets and keeps workout history in the browser. It includes rest timers, progress records and backup import/export.

`JavaScript` `HTML/CSS` `PWA` `Offline caching` `Local storage`

- **Practical focus:** mobile use, adaptable training programmes and access without a connection.
- **Implementation:** persistent workout history, save-data migration and tests for programme generation and training calculations.

[Explore Hypertrophy →](projects/workout-tracker/)

---

### 03 / Build Lab — Constraint-Based Planning

**Compare configurations while keeping interdependent rules and limits in view.**

A React application built for NBA 2K player planning. A separate calculation layer models linked attributes and budget limits, while the interface supports locked values, undo, saved configurations and comparisons.

`React` `JavaScript` `State management` `Web Workers` `Automated testing`

- **Engineering focus:** managing dependent inputs, keeping changes consistent and moving configuration searches off the main UI thread.
- **Validation:** unit tests for calculation logic and Playwright tests for browser interactions. Game rules and data are externally sourced; see the project attribution and accuracy notes.

[Explore Build Lab →](projects/build-lab/)

---

### 04 / Travian Extensions — Browser Tools Suite

**Turn browser-page data into planning views, event alerts and configurable interface tools.**

Seven independently installable Manifest V3 extensions built for Travian. The suite includes settlement forecasts, statistics history, scheduled alerts and interface customisation, with usage guides and versioned release packages.

`JavaScript` `Manifest V3` `Service workers` `Chrome APIs` `Persistent storage`

- **Engineering focus:** integrating with changing pages, maintaining local data and scheduling notifications through background browser services.
- **Maintenance:** individual settings, documented installation and automated packaging of extension releases.

[Explore Travian Extensions →](projects/travian-extensions/)

---

## All projects

| Project                                                                           | What it does                                                                                        | Main skills                                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [PC Remote](projects/pc-remote/)                                                  | Controls a Windows PC from a phone over the local network, with paired devices and hardened sign-in | Python, WebSockets, authentication, pytest, touch interfaces |
| [Hypertrophy](projects/workout-tracker/)                                          | Logs training, tracks progress and stores workout history offline                                   | JavaScript, responsive UI, PWA, local storage                |
| [Build Lab](projects/build-lab/)                                                  | Constraint-based NBA 2K player planning with linked inputs, saved configurations and comparisons    | React, JavaScript, state management, automated tests         |
| [Travian Extensions](projects/travian-extensions/)                                | Browser tools for Travian: planning, data visualisation, event alerts and interface customisation   | Manifest V3, service workers, Chrome APIs, DOM integration   |
| [Next Settlement Calc](projects/travian-extensions/extensions/NextSettlementCalc) | Estimates when culture points reach settlement thresholds                                           | Data parsing, forecasting, event simulation                  |
| [TravAlarm](projects/travian-extensions/extensions/travAlarm)                     | Tracks game events and schedules browser/audio alerts                                               | Manifest V3, service workers, Chrome APIs                    |
| [Travian QoL](projects/travian-extensions/extensions/TravianQoL)                  | Configurable interface improvements and planning tools                                              | Modular JavaScript, DOM integration, persistent settings     |
| [Travian Night Mode](projects/travian-extensions/extensions/travian_night_mode)   | Persistent dark theme for dynamically changing pages                                                | CSS, MutationObserver, preference synchronisation            |
| [BMW M4 ADRO Kit ↗](https://www.nexusmods.com/forzahorizon6/mods/469)             | Published Forza Horizon 6 vehicle mod with two body variants                                        | Blender, 3D modelling, game modding                          |

## Skills in practice

| Area                      | Examples in this portfolio                                                           |
| :------------------------ | :----------------------------------------------------------------------------------- |
| **Frontend development**  | React, JavaScript, responsive HTML/CSS, browser storage                              |
| **Backend & integration** | Python, WebSockets, local network services                                           |
| **Browser tooling**       | Manifest V3, content scripts, service workers, DOM integration                       |
| **Testing & workflow**    | Git, GitHub Actions CI, ESLint, Prettier and Black, unit, browser and security tests |
| **3D work**               | Blender modelling, vehicle modifications and release packaging                       |

## Explore the repository

Each project has its own README covering its purpose, source structure and how to try it. Everything lives under `projects/`.

Start with PC Remote for Python and device integration, or Hypertrophy for a mobile web app with offline storage. Other projects remain available in the table above.

## Quality checks

Every push runs [CI](.github/workflows/ci.yml): ESLint and Prettier across the repository, Black for the Python code, unit tests for Build Lab, PC Remote and Hypertrophy, and Build Lab's production build and Playwright browser tests. To run the same checks locally:

```sh
npm ci
npm run lint && npm run format:check && npm test
```

PC Remote's tests run with Python 3.10 or newer:

```sh
pip install -r projects/pc-remote/requirements-dev.txt black
black --check projects/pc-remote
python -m pytest projects/pc-remote
```

See [docs/VALIDATION.md](docs/VALIDATION.md) for what the tests cover and what still needs a manual check.

## Scope and attribution

Game projects are independent fan projects, not official products. Build Lab includes externally sourced rule data and game-related artwork; see [sources and attribution](ATTRIBUTION.md) and its documented accuracy limitations. M4 downloads are hosted on Nexus Mods, not copied into this repository.

No blanket open-source licence is asserted for third-party assets.
