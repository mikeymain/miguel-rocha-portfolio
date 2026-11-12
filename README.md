# Miguel Rocha

**Technical support · Junior development**

Lisbon, Portugal · Portuguese (native) · English (C2)

I build web and Windows applications, browser extensions and tools that simplify everyday tasks, alongside customer support experience at Teleperformance (Meta Business Support, 90%+ CSAT) and Majorel (Bolt). Open to Lisbon-based and remote roles in technical support or junior development.

[LinkedIn](https://www.linkedin.com/in/miguel-rocha-63755922b/) · [Source guide](docs/REVIEWER-GUIDE.md) · [Validation](docs/VALIDATION.md)

## Software projects

### [PC Remote](projects/pc-remote/)

A phone-based controller for a Windows PC: trackpad, keyboard, hotkeys, media and volume, over the local network.

- Python WebSocket server secured with PIN pairing, per-device tokens, host and origin checks, rate limiting and command validation.
- pytest tests for pairing, sign-out, rate limits and command handling, including security tests, with the Windows input layer replaced by a stub.
- Uses plain HTTP, so it is meant for trusted networks. See the [security notes](projects/pc-remote/README.md#security).

**Python · JavaScript · HTML · CSS · WebSockets · pytest**

### [Hypertrophy](projects/workout-tracker/)

An installable workout app with plans tailored to experience and equipment, set logging, rest timers and exercise substitutions.

- Eight-week training blocks, load progression, 1RM estimates, history and personal records.
- Works offline; data stays on the device, with validated JSON backups and automatic save migration.
- Node.js tests for programme generation, save migration and training calculations.

**JavaScript · HTML · CSS · Progressive Web App**

### [Aurora](projects/aurora/)

A Windows calendar with recurring alarms, iCloud and Google integration, Gmail event imports, sports schedules, team tracking, game alerts and match statistics.

- Electron desktop app with a React interface: alarms keep running from the system tray, and missed reminders show after the PC wakes.
- Credentials are encrypted, Google access is read-only, and calendar saves keep the previous copy so a crash cannot corrupt data.
- Node.js tests for recurrence, time zones, imports and sync, plus a smoke test of startup and a background alarm.

**JavaScript · HTML · CSS · React · Electron · Vite · OAuth**

### [Travian Extensions](projects/travian-extensions/)

Eight browser extensions for the strategy game Travian: event notifications, ranking history, comparison charts and planning calculations.

- Built with content scripts, DOM integration, service workers and Chrome APIs, with persistent storage and configurable settings.
- Each extension has its own installation guide and versioned [release package](https://github.com/mikeymain/miguel-rocha-portfolio/releases).

**JavaScript · HTML · CSS · Chrome Manifest V3**

## 3D modelling

### [BMW M4 ADRO Kit — Nexus Mods](https://www.nexusmods.com/forzahorizon6/mods/469)

Co-created a vehicle mod for Forza Horizon 6, contributing Blender 3D modelling for the widebody and standard-body variants. Contributor credits are listed on the published release.

**Blender · 3D modelling**

## Repository guide

Project READMEs contain setup instructions and source maps. The [source guide](docs/REVIEWER-GUIDE.md) identifies implementation entry points; [validation](docs/VALIDATION.md) describes automated coverage and manual checks.

[GitHub Actions](https://github.com/mikeymain/miguel-rocha-portfolio/actions/workflows/ci.yml) runs JavaScript linting and formatting, Python formatting, unit tests, and Aurora's tests and production build. Aurora and the Travian extensions are excluded from root linting and formatting.

Game-related projects are unofficial. Third-party data and assets are documented in [attribution](ATTRIBUTION.md); no blanket licence is asserted for those materials.
