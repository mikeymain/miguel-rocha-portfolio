# Maintaining this portfolio

This repository holds portfolio copies of personal projects. Each project is developed in its own working repository, then copied here deliberately and reviewed before committing.

## Organisation

- `projects/`: Build Lab, PC Remote, Workout Tracker and Travian Extensions. The M4 mod is linked to its Nexus Mods page only.
- `assets/`: the header and screenshots used by the READMEs.
- `docs/`: validation notes and this guide.
- `ATTRIBUTION.md`: third-party sources and ownership notes.

## Updating a project

1. Copy the changed source in from the working repository.
2. Run `npm run lint`, `npm run format:check` and `npm test` from the root, plus the project's own tests (Build Lab: `npm test` and `npm run test:ui`; PC Remote: `black --check` and `python -m pytest`).
3. Update the project's README if features or commands changed.
4. Open a pull request and let CI pass before merging.

## Travian extensions

**ALWAYS publish every extension change to [`projects/travian-extensions`](../projects/travian-extensions/).** This folder is the public distribution. Update the installed development source and these runtime files together, update affected guides and screenshots, and commit and push before declaring completion. Report any publishing blocker. The user has provided standing authorization to publish requested extension changes.

Bumping an extension's manifest version on `main` publishes a release zip for it ([release workflow](../.github/workflows/release.yml)). The extension sources are excluded from the portfolio's ESLint and Prettier checks because they are maintained in the development checkout.

## Never committed

Installed dependencies, browser profiles, local agent settings, deployment credentials, PC Remote's local configuration and paired devices, and large mod archives stay out of the repository. `.gitignore` covers the common cases; review the diff for anything else.
