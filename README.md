
# FoxComm — Windows (P2P + UPnP)

One app to host or join. Dark, futuristic UI. Voice + 4K screen streaming (best-effort). No accounts. LAN-first; tries UPnP for Internet play.

## Build locally (publisher only)
```
npm install
npm run pack
```
Output: `dist/FoxComm-win32-x64/FoxComm.exe` — zip and share the folder.

## GitHub Actions
- `.github/workflows/build-windows.yml` → manual/auto build artifact.
- `.github/workflows/release-windows.yml` → tag `vX.Y.Z` to auto-create a Release with the zipped build.

## Features
- P2P WebRTC voice + screen share (4K-capable depending on HW/bandwidth)
- Embedded signaling (host clicks **Host Room**)
- UPnP auto-port mapping attempt for Internet joins
- Push-to-Talk (hold **V**), Mute toggle
- Per-stream quality: 4K / 1440p / 1080p buttons
- Settings → Echo Cancellation, Noise Suppression, Auto Gain Control
- Theme color pickers (accent/background/panel), persisted locally
- SFU Host (experimental placeholder)

## Usage
Host: enter Room + Port → **Host Room** → share IP:PORT + Room Name → allow Windows Firewall.  
Join: enter `HOST_IP:PORT` → **Join** → enter same Room Name.  
Click **Start Stream** to share your screen + mic.
