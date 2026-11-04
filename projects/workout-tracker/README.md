# Hypertrophy

[Portfolio](../../README.md) · [Attribution](../../ATTRIBUTION.md)

Installable workout tracker for recording sets, reviewing progress and generating training programmes from equipment and experience.

**JavaScript modules · HTML/CSS · Service workers · localStorage**

## Features

- Programme generation from training level, equipment, split and focus.
- Set logging, rest timers, exercise substitutions and eight-week training blocks.
- Workout history, personal records, estimated one-repetition maximum and bodyweight tracking.
- Offline caching and JSON backup import/export.

## Run locally

Requires Python for the local web server. No application build step or runtime package installation is required. Run from this directory:

```sh
python -m http.server 8742 --directory app
```

Open `http://localhost:8742`. The source folder remains `workout-tracker`; some app labels still use Leg Day, Lift or Gym.

## Source guide

| Path                                                       | Purpose                                           |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `app/js/program.js`                                        | Exercise library and programme generation         |
| `app/js/state.js`                                          | Persistence, save migration and progression       |
| `app/js/stats.js`                                          | Records, volume and streak calculations           |
| `app/js/home.js`, `workout.js`, `history.js`, `profile.js` | Screen rendering                                  |
| `app/sw.js`                                                | Offline caching                                   |
| `tests/`                                                   | Programme, storage and training-calculation tests |

## Validation

From the repository root:

```sh
npm ci
npm test
```

Node.js tests cover programme generation across onboarding profiles, save migration, training-block calculations and one-repetition maximum estimates. Phone installation and offline behaviour require manual verification.

## Data

Workout data is stored in the browser. Export a backup before clearing browser storage or changing devices. Exercise photographs come from free-exercise-db; see [attribution](../../ATTRIBUTION.md).
