# Sumo Crumble — Multiplayer

Real-time, top-down ring-out arena. No health — the only way out is the pit. Shove rivals off the crumbling floor, build a streak (you get bigger, hit harder, and your score multiplier climbs), and hunt the crowned leader for double points. Empty slots are filled with bots so the arena is never empty.

The game is **server-authoritative**: a Node + WebSocket server runs one shared simulation, and every browser is a thin client that sends inputs and renders snapshots. That means no one can cheat by editing their client, and everyone sees the same fight.

## Controls
- **Move** — mouse (or drag on touch)
- **Shove** — Click / Space — a lunging body-check
- **Slam** — Shift / Right-click — a radial shockwave
- Power-ups: charged shove ·  shield ·  speed. Watch for modifier events (low gravity, giants, ice rink, sudden death) and the spinning bar.

 
