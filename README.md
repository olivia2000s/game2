# Sumo Crumble — Multiplayer

Real-time, top-down ring-out arena. No health — the only way out is the pit. Shove rivals off the crumbling floor, build a streak (you get bigger, hit harder, and your score multiplier climbs), and hunt the crowned leader for double points. Empty slots are filled with bots so the arena is never empty.

The game is **server-authoritative**: a Node + WebSocket server runs one shared simulation, and every browser is a thin client that sends inputs and renders snapshots. That means no one can cheat by editing their client, and everyone sees the same fight.

## Controls
- **Move** — mouse (or drag on touch)
- **Shove** — Click / Space — a lunging body-check
- **Slam** — Shift / Right-click — a radial shockwave
- Power-ups: ⚡ charged shove · 🛡 shield · 👟 speed. Watch for modifier events (low gravity, giants, ice rink, sudden death) and the spinning bar.

## Run it locally
Requires **Node 18+**.

```bash
npm install
npm start
```
Then open **http://localhost:3000**. To play with others on the same Wi-Fi, have them open `http://<your-computer-LAN-IP>:3000` (e.g. `http://192.168.1.20:3000`). Open a second browser tab to test multiplayer yourself.

## Put it on GitHub
```bash
git init
git add .
git commit -m "Sumo Crumble multiplayer"
git branch -M main
git remote add origin https://github.com/<you>/sumo-crumble.git
git push -u origin main
```
> GitHub **stores** the code but does not **run** a Node server — you still need a host (below) for people on the internet to play.

## Deploy so anyone can play (Render — free)
1. Push to GitHub (above).
2. Go to [render.com](https://render.com) → **New + → Blueprint** → connect your repo. It reads `render.yaml` automatically. (Or **New + → Web Service**, then set Build = `npm install`, Start = `npm start`.)
3. Deploy. You'll get a public `https://…onrender.com` URL that serves the game and the WebSocket on the same origin (the client auto-detects `wss://`).

**Free tier note:** Render's free plan sleeps after ~15 min of no traffic, so the first visitor waits ~30–60s for it to wake. Upgrade that one service to **Starter (~$7/mo)** to keep it always-on. Railway and Fly.io work the same way (`npm start`, expose `$PORT`).

## How it fits together
- `server.js` — authoritative simulation (physics, shove/slam, streak, crown bounty, combos, crumbling+regrowing floor, power-ups, modifiers, bots) at 30 ticks/s, broadcasting compact snapshots ~15×/s.
- `public/index.html` — the client: interpolates other players, predicts your own movement locally for responsiveness, and renders everything. Sound, settings, and cosmetics are client-side.
- Cosmetics (name/color/hat) are chosen at join and sent to the server. There are no accounts yet — adding cross-device profiles would mean adding a small database and login.

## Tuning
Gameplay constants live in the `CFG` object at the top of `server.js` (shove force, streak growth, respawn time, bot count via `TARGET`, tick rate, etc.). Change, restart, done.
