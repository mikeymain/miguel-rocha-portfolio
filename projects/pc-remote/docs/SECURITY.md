# PC Remote security

[Project overview](../README.md) · [Usage](USAGE.md)

A paired device can control the PC. The server implements the following checks:

| Threat                                                                                                       | Protection                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another device on the network guesses the PIN                                                                | Random 8-digit PIN by default (6 characters minimum, obvious ones flagged). Ten wrong attempts from one address lock it out for up to five minutes; IPv6 addresses count per /64, so rotating addresses doesn't help. After 30 failures in five minutes from all addresses combined, pairing pauses; already-paired phones keep working. |
| A connection holds a slot open without signing in                                                            | Closed after 10 seconds.                                                                                                                                                                                                                                                                                                                 |
| A web page, opened in any browser on the network, connects to the WebSocket (cross-site WebSocket hijacking) | The handshake must come from the app's own origin.                                                                                                                                                                                                                                                                                       |
| A web page points its own domain at the PC (DNS rebinding)                                                   | Requests whose `Host` isn't one of the PC's names or addresses get a 403.                                                                                                                                                                                                                                                                |
| A copy of the server's files leaks                                                                           | The PIN pairs a phone once. After that the phone signs in with a random 256-bit token, and `devices.json` keeps only SHA-256 hashes of the tokens.                                                                                                                                                                                       |
| A phone is lost                                                                                              | _Disconnect remote_ unpairs a phone from the phone. Changing the PIN, or deleting `devices.json`, signs out every phone.                                                                                                                                                                                                                 |
| Malformed or hostile commands                                                                                | Every field is type-checked and clamped (pointer movement, scroll, click count, 500 characters of text per message, volume). Unknown commands and keys are refused, power actions come from a fixed list, and a message over 256 KB closes the connection. Unexpected errors reply with a generic message, never internal details.       |
| Framing, sniffing, or reading files outside the app                                                          | Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff` and `no-referrer` on every page. Static files are served only from `web/`. No `Server` banner.                                                                                                                                                                               |

**Limits**

- **Traffic is plain HTTP.** Anyone who can capture traffic on the network can
  read the PIN during pairing, the device token, and what you type. Use it on a
  network you trust, not public Wi-Fi.
- **Never forward the port to the internet.** To use it away from home, put
  both devices on [Tailscale](https://tailscale.com); its WireGuard tunnel
  encrypts the traffic. Connect to the PC's Tailscale address, or add its
  MagicDNS name to `allowed_hosts`.
- Keep the firewall rule scoped to `LocalSubnet`.
- Software already running as your Windows user can read `config.json`. That
  is outside what the server can protect against.
- The phone keeps its device token in the browser's `localStorage`, where
  script on the page could read it. The page loads only its own scripts (CSP
  `script-src 'self'`) and renders user text as text, not HTML. Anyone with
  the phone unlocked can use the remote; use _Disconnect remote_ or change the
  PIN to revoke it.
