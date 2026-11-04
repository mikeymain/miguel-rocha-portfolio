# PC Remote usage

[Project overview](../README.md) · [Security](SECURITY.md)

## Putting it on the iPhone home screen

1. Put the phone and the PC on the same network.
2. Open the **`.local` address** (`http://<pc-name>.local:8765`) in **Safari**.
   Use the host name rather than the IP so the saved address survives IP changes.
3. Tap Share, then **Add to Home Screen**.
4. Launch it from the icon. It opens full screen with no browser bars.
5. Enter the PIN once to pair.

### Add the icon from the `.local` name, not an IP

iOS bakes the origin into a home-screen icon when you add it, and both
`start_url` in the manifest and the WebSocket URL in `app.js` are relative to
that origin. The icon stays pinned to whatever host you were on.

An icon pinned to an IP stops working the next time the PC's address changes:
a new DHCP lease, a switch between Ethernet and Wi-Fi, or tethering to the
phone's hotspot. It then opens to a blank screen while the server is perfectly
healthy. The `.local` name is published over mDNS and follows the PC across
addresses. (The setup this was built on publishes it with Apple's Bonjour
service.)

The server listens on **IPv4 and IPv6**. mDNS publishes an AAAA record next to
the A record and iOS usually tries the AAAA first, so an IPv4-only socket makes
the name look dead while the IP still works.

## Using it

**Touchpad**

- Drag to move the cursor, tap to left-click.
- Two-finger tap = right-click, three-finger tap = middle-click.
- Two-finger drag, or the strip on the right, scrolls.
- **Click and drag:** press and hold one finger still for about half a second.
  The pad tints and the left button goes down; drag, then lift to drop.
  Tap-then-tap-and-hold also works, but Windows reads the leading tap as the
  first half of a double-click, so prefer press-and-hold on files and title bars.
- For a drag too long for one swipe, tap _Drag_ to latch the left button down,
  swipe as often as you need, then tap _Drag_ again to drop. Long-pressing
  _Middle_ or _Right_ latches those buttons the same way.
- The text field above the pad types on the PC as you type.
- _Speed_ sets pointer sensitivity; _Natural scroll_ flips the scroll direction.

**Alt+Tab**

- The Alt+Tab button (on the pad's favourites row and in Hotkeys) holds Alt
  down on the PC, so the window switcher stays on screen. Step through it with
  _Prev_ / _Next_, then _Select window_, or _Cancel_ to go back.
- Alt is released when you choose, when the app goes to the background, and by
  the PC itself if the phone drops off, to release the held key.

**Keys**

- Characters typed in the text field land on the PC as you type; deleting in
  the field sends backspaces.
- Esc, Tab, Enter, Backspace, Delete, Win, Space, PrtScn, the navigation
  cluster, arrows and F1 to F12.

**Hotkeys**

- Tap a button to fire it.
- _Edit_, then tap a button to change it or `+` to add one. Long-pressing any
  button edits it without entering edit mode.
- In edit mode, press and hold a button to lift it out of the grid and drag it
  to a new spot; the new order saves when you let go.
- In edit mode, tap `+` in the page strip to add a page, or tap the current
  page to rename or delete it.
- Everything is stored in `hotkeys.json`, which you can also edit by hand.

**Media**

- Transport controls, a system volume slider, mute, and power actions (lock,
  sleep, sign out, restart, shut down). Sign out, restart and shut down need a
  second tap.
- _Disconnect remote_ at the bottom of Power unpairs the phone.

## Hotkey syntax

`modifier+modifier+key`, for example `ctrl+shift+s`, `win+d`, `alt+f4`, `f11`,
`ctrl+=`.

- Modifiers: `ctrl`, `shift`, `alt`, `win`
- Named keys: `enter` `tab` `escape` `backspace` `delete` `space` `up` `down`
  `left` `right` `home` `end` `pageup` `pagedown` `insert` `printscreen`
  `menu` `capslock` `numlock` `scrolllock` `pause` `f1`–`f20`
- Media keys: `playpause` `next` `prev` `volup` `voldown` `mute`
- Any other single character is typed as itself (`c`, `7`, `/`, `+`).

Specs are limited to 64 characters, and unknown names are rejected with an
error instead of being guessed at.

## Configuration

`config.json` is created on the first run and is ignored by git:

```json
{ "pin": "58203914", "port": 8765 }
```

| Key             | Default             | Meaning                                                                                                                |
| --------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pin`           | random, 8 digits    | Pairs new phones. At least 6 characters. Changing it signs out every paired phone.                                     |
| `port`          | `8765`              | HTTP and WebSocket port. Update the firewall rule to match.                                                            |
| `allowed_hosts` | none                | Extra host names to answer to, such as a Tailscale MagicDNS name. The PC's own names and addresses are always allowed. |
| `bind`          | `["0.0.0.0", "::"]` | Addresses to listen on. List a single address to listen on one network only.                                           |

Restart the server after editing it.

## Firewall

Allow the port from your own subnet only (admin PowerShell):

```powershell
New-NetFirewallRule -DisplayName "PC Remote (8765)" -Direction Inbound `
  -Action Allow -Protocol TCP -LocalPort 8765 -Profile Any -RemoteAddress LocalSubnet
```

If the phone cannot resolve the `.local` name and you use Bonjour, note that
its own firewall rules cover the _Public_ profile only. This rule allows mDNS
on any profile, again from the local subnet only:

```powershell
New-NetFirewallRule -DisplayName "PC Remote mDNS (5353)" -Direction Inbound `
  -Action Allow -Protocol UDP -LocalPort 5353 -Profile Any -RemoteAddress LocalSubnet `
  -Program "C:\Program Files\Bonjour\mDNSResponder.exe"
```

## Starting with Windows

A scheduled task runs the server at logon with `pythonw.exe`, so there is no
console window. Run this from the project folder:

```powershell
$action = New-ScheduledTaskAction -Execute (Get-Command pythonw.exe).Source `
  -Argument "server.py" -WorkingDirectory $PWD
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask "PC Remote" -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings
```

```powershell
Start-ScheduledTask "PC Remote"                        # start it now
Stop-ScheduledTask "PC Remote"                         # stop it
Unregister-ScheduledTask "PC Remote" -Confirm:$false   # remove it
```

To watch the log instead, stop the task and run `start.bat`.

### Elevated or not

Windows (UIPI) stops a normal process from sending input to an elevated
window, such as Task Manager or an admin terminal. With `-RunLevel Limited`
the remote does nothing while one of those has focus, until you click a normal
window. Registering the task with `-RunLevel Highest` (from an admin
PowerShell) lifts that, but then a paired phone can type into admin windows
too. Keep `Limited` unless you need that.

## Updating the app

Edit anything under `web/` and the phone picks it up by itself:

- Every response is sent `Cache-Control: no-store`, so iOS never keeps a stale copy.
- The server watches `web/` and pushes a reload to connected phones when a file changes.
- A phone that was asleep compares an asset stamp when it reconnects and
  reloads if its copy is old.

The exception is the **home-screen icon and name**, which iOS captures when the
icon is added; changing `icon-180.png` means removing and re-adding the icon.
Changes to the Python files need a server restart.
