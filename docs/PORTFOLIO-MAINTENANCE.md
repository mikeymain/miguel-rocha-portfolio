# Maintaining this portfolio

This repository holds portfolio copies of personal projects. Each project is developed in its own working repository, then copied here deliberately and reviewed before committing.

## Organisation

- `projects/`: Build Lab, PC Remote and Workout Tracker. The M4 mod is linked to its Nexus Mods page only.
- Travian extensions: links to [the public repository](https://github.com/mikeywikey-coding/travian-extensions); no extension copies are stored here.
- `assets/`: screenshots used by the READMEs.
- `docs/`: validation notes and this guide.
- `ATTRIBUTION.md`: third-party sources and ownership notes.

## Updating a project

1. Copy the changed source in from the working repository.
2. Run `npm run lint`, `npm run format:check` and `npm test` from the root, plus the project's own tests (Build Lab: `npm test` and `npm run test:ui`; PC Remote: `black --check` and `python -m pytest`).
3. Update the project's README if features or commands changed.
4. Open a pull request and let CI pass before merging.

## Travian extensions

**ALWAYS publish every extension change to [travian-extensions](https://github.com/mikeywikey-coding/travian-extensions).** Update the installed development source and public runtime files together, update affected guides and screenshots, and commit and push the public changes before declaring completion. Report any publishing blocker. Keep this portfolio linked to that repository; do not reintroduce extension snapshots. The user has provided standing authorization to publish requested extension changes.

## Never committed

Installed dependencies, browser profiles, local agent settings, deployment credentials, PC Remote's local configuration and paired devices, and large mod archives stay out of the repository. `.gitignore` covers the common cases; review the diff for anything else.
