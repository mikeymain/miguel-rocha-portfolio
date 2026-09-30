# Portfolio snapshot validation

## PC Remote security rework — 30 September 2026

PC Remote was taken out of the portfolio while its server was reworked for a public repository, then added back from the reworked source.

- The server now checks the `Host` header (DNS rebinding) and the WebSocket origin (cross-site WebSocket hijacking), pairs phones with the PIN and then signs them in with per-device tokens stored only as SHA-256 hashes, closes connections that do not sign in within 10 seconds, limits failed attempts per address and overall, and validates every command.
- 39 pytest tests passed on Python 3.12.10 with websockets 17.0.1. The tests replace the Windows input layer with a stub, so no input or power commands were sent.
- A smoke test against a locally running server, also with the stubbed input layer, passed 11 of 11 checks: the page served with security headers and no `Server` banner, a refused foreign `Host`, a refused cross-origin WebSocket, wrong-PIN refusal, pairing, token sign-in, ping, the sign-in timeout and hashed token storage.
- Local configuration, paired devices, hotkey layouts and a development note are excluded. The 20 snapshot files were checked for credential patterns and personal host names and addresses; no findings.

Checked on 21 September 2026 while assembling this repository:

- Build Lab: clean dependency installation, production build and all 52 included Node.js calculation tests passed.
- Build Lab reports a bundle-size warning; the production build succeeds. Browser tests are included but were not rerun for this packaging change.
- All four extension manifests resolve their declared local scripts, styles, icons, popup pages and web-accessible assets.
- Main portfolio and project README relative links resolve.
- Candidate Git files were checked for common credential patterns, local configuration files and oversized blobs. No matching credentials were found; this is not a full security audit.

No live game sessions, extension behaviour tests or full Workout Tracker browser tests were performed during portfolio assembly.
