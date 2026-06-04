# Sumo Crumble — Multiplayer

Real-time, top-down ring-out arena. No health — the only way out is the pit. Shove rivals off the crumbling floor, build a streak (you get bigger, hit harder, and your score multiplier climbs), and hunt the crowned leader for double points. Empty slots are filled with bots so the arena is never empty.

The game is **server-authoritative**: a Node + WebSocket server runs one shared simulation, and every browser is a thin client that sends inputs and renders snapshots. That means no one can cheat by editing their client, and everyone sees the same fight.

## Controls
- **Move** — mouse (or drag on touch)
- **Shove** — Click / Space — a lunging body-check
- **Slam** — Shift / Right-click — a radial shockwave
- Power-ups: ⚡ charged shove ·  shield ·  speed. Watch for modifier events (low gravity, giants, ice rink, sudden death) and the spinning bar.

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

 
## Tuning
Gameplay constants live in the `CFG` object at the top of `server.js` (shove force, streak growth, respawn time, bot count via `TARGET`, tick rate, etc.). Change, restart, done.
