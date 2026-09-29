# Maintaining this portfolio

This repository holds portfolio copies of personal projects. Each project is developed in its own working repository, then copied here deliberately and reviewed before committing.

## Organisation

- `projects/`: Build Lab, Workout Tracker and the M4 mod case study.
- `extensions/`: the four Travian browser extensions, with shared tests in `extensions/tests/`.
- `assets/`: screenshots used by the READMEs.
- `docs/`: validation notes and this guide.
- `ATTRIBUTION.md`: third-party sources and ownership notes.

## Updating a project

1. Copy the changed source in from the working repository.
2. Run `npm run lint`, `npm run format:check` and `npm test` from the root, plus the project's own tests (Build Lab: `npm test` and `npm run test:ui`).
3. Update the project's README if features or commands changed.
4. Open a pull request and let CI pass before merging.

## Never committed

Installed dependencies, browser profiles, local agent settings, deployment credentials and large mod archives stay out of the repository. `.gitignore` covers the common cases; review the diff for anything else.
