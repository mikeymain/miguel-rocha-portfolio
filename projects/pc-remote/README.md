# PC Remote

[Portfolio](../../README.md) · [Usage guide](docs/USAGE.md) · [Security details](docs/SECURITY.md)

Control a Windows PC from a phone over the local network, using a browser interface and a Python WebSocket server.

**Python · JavaScript · HTML/CSS · WebSockets · pynput · pycaw**

## Features

- Touch trackpad, live keyboard input and configurable hotkey pages.
- Media playback, system volume, window switching and power controls.
- Home-screen installation, light/dark themes and connection recovery.
- PIN pairing, per-device tokens, host and origin checks, rate limiting and command validation.

## Run locally

Requires Windows 10 or 11, Python 3.10 or newer, and a phone on the same network. Run from this directory:

```powershell
pip install -r requirements.txt
python server.py
```

Open the address printed by the server on your phone and enter the generated PIN. `start.bat` is an alternative launcher. For firewall configuration, iPhone home-screen setup and automatic startup, see the [usage guide](docs/USAGE.md).

## Source guide

| Path            | Purpose                                                       |
| --------------- | ------------------------------------------------------------- |
| `server.py`     | HTTP/WebSocket service, authentication and command validation |
| `controller.py` | Windows input, audio and power controls                       |
| `keys.py`       | Hotkey parsing                                                |
| `store.py`      | Configuration, hotkeys and paired-device records              |
| `web/`          | Phone interface and assets                                    |
| `tests/`        | pytest coverage with Windows input replaced by a stub         |

## Validation

```powershell
pip install -r requirements-dev.txt
python -m pytest
```

The suite covers hotkey parsing, storage, host and origin checks, pairing, sign-out, rate limits and command validation. Real phone input, audio and power actions require manual verification.

## Security

Traffic uses plain HTTP. Use a trusted network, restrict firewall access to the local subnet and do not forward the port to the internet. For remote access, use an encrypted private network such as Tailscale. See [security details](docs/SECURITY.md) for protections, device revocation and remaining limits.
