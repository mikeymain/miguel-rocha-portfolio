# Miguel Rocha

**Technical support · Junior development**

Lisbon, Portugal · Portuguese (native) · English (C2)

Personal projects in JavaScript, React and Python, alongside customer support experience at Teleperformance (Meta Business Support) and Majorel (Bolt). Open to Lisbon-based and remote roles.

[LinkedIn](https://www.linkedin.com/in/miguel-rocha-63755922b/) · [Source guide](docs/REVIEWER-GUIDE.md) · [Validation](docs/VALIDATION.md)

## Software projects

### [PC Remote](projects/pc-remote/)

Control a Windows PC from a phone over the local network: trackpad, keyboard, hotkeys, media and volume controls.

- Python WebSocket server with PIN pairing, per-device tokens, host and origin checks, rate limiting and input validation.
- pytest coverage for authentication and command handling, with the Windows input layer replaced by a stub.
- Uses plain HTTP; intended for trusted networks. See the [security notes](projects/pc-remote/README.md#security).

**Python · JavaScript · WebSockets · Windows APIs · pytest**

### [Hypertrophy](projects/workout-tracker/)

Installable workout tracker with equipment-based programmes, set logging, rest timers and progress history.

- Offline caching, browser-local storage and JSON backup import/export.
- Node.js tests for programme generation, save migration and training calculations.

**JavaScript · HTML/CSS · Service workers · localStorage**

### [Build Lab](projects/build-lab/)

React application for NBA 2K player planning, with linked attributes, budget limits, saved configurations and comparisons.

- Separate calculation layer, locked inputs, undo and configuration searches in a Web Worker.
- Calculation unit tests and Playwright browser tests. Externally sourced rules have [documented accuracy limits](projects/build-lab/README.md#accuracy).

**React · JavaScript · Vite · Web Workers · Playwright**

### [Travian Extensions](projects/travian-extensions/)

Eight Manifest V3 browser extensions for Travian: settlement forecasts, statistics history, event alerts and configurable interface tools.

- Content scripts, background services, persistent settings and browser notifications.
- Individual installation guides and versioned [release packages](https://github.com/mikeymain/miguel-rocha-portfolio/releases).

**JavaScript · Chrome APIs · Service workers · DOM integration**

## 3D modelling

### [BMW M4 ADRO Kit — Nexus Mods](https://www.nexusmods.com/forzahorizon6/mods/469)

Contributed Blender vehicle modelling to a collaborative Forza Horizon 6 mod, including widebody and standard-body variants. Contributor credits are listed on the published release.

**Blender · Vehicle modelling · Collaboration**

## Repository guide

Project READMEs contain setup instructions and source maps. The [source guide](docs/REVIEWER-GUIDE.md) identifies implementation entry points; [validation](docs/VALIDATION.md) describes automated coverage and manual checks.

[GitHub Actions](https://github.com/mikeymain/miguel-rocha-portfolio/actions/workflows/ci.yml) runs JavaScript linting and formatting, Python formatting, unit tests, and Build Lab's production build and browser tests. Travian extensions are excluded from linting and formatting.

Game-related projects are unofficial. Third-party data and assets are documented in [attribution](ATTRIBUTION.md); no blanket licence is asserted for those materials.
