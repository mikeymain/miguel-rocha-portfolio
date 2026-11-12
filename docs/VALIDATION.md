# Validation

## Automated, on every push

[CI](../.github/workflows/ci.yml) runs these checks:

| Area             | Checks                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whole repository | ESLint and Prettier                                                                                                                                         |
| Aurora           | Node.js tests for calendar logic, recurrence, time zones, imports, iCloud, Google and sports; production build                                              |
| PC Remote        | Black; pytest for host and origin checks, PIN pairing and device tokens, failed-attempt limits and command validation, with the Windows input layer stubbed |
| Hypertrophy      | Programme generation for every onboarding profile, save migration, training-block maths, 1RM estimates                                                      |

[Travian Extensions](../projects/travian-extensions/) are developed in a separate checkout and are excluded from ESLint and Prettier here. CI only packages their release zips.

## Manual checks

These need a real environment and are not automated:

- Hypertrophy's offline caching and install flow on a phone.
- Aurora's desktop alarms, sleep and resume, and live iCloud and Google accounts.
- PC Remote with a real phone and the Windows input layer (mouse, keyboard, volume and power), which the tests replace with a stub.

Exercise media and third-party datasets are checked by hand when they change; see [ATTRIBUTION.md](../ATTRIBUTION.md).
