# Pomo Together

A Pomodoro timer a group of people can share. One person creates a room, sends
the link, and everyone's clock counts down together — start, pause, skip and
timer lengths are all shared, in real time.

No accounts, no database, no build step. Runs entirely on Cloudflare Workers.

## How it works

```
browser  ──WebSocket──▶  Worker  ──▶  Durable Object (one per room)
                                        · authoritative timer state
                                        · storage alarm fires the phase change
                                        · broadcasts to everyone in the room
```

The server owns the clock. While the timer runs it publishes an absolute
`endsAt` timestamp plus its own current time; each client measures its offset
from the room's clock with a ping/pong round trip and renders
`endsAt - (now + offset)`. Nothing counts down locally, so screens can't drift
apart, and a refresh — or a laptop waking from sleep — lands on the right time.

Phase changes are driven by a Durable Object storage alarm rather than a
`setTimeout`, so they still fire correctly after the object has been evicted.
Sockets use WebSocket Hibernation, so an idle room costs nothing to keep open.

## Features

- **Shared rooms** — `/r/quiet-ember-42`. Anyone with the link can join and
  control the timer. Participants are anonymous (`Guest 1`, `Guest 2`, …).
- **Custom lengths** — focus, short break and long break are each free to set
  from 1 to 180 minutes, plus how many rounds precede a long break. Changes
  apply to everyone. Presets: Classic 25/5/15, Deep 50/10/30, Sprint 15/3/15.
- **Full cycle** — focus → short break → focus → … → long break, with an
  optional auto-start for the next phase.
- **A chime ends every session**, work or rest, on every screen in the room at
  once. The two are different patterns — rising when focus ends, falling when a
  break does — so you can tell them apart without looking. The sound is
  synthesised with the Web Audio API, so there is no audio file to load or
  fail. Browsers block audio until a page has been interacted with, so the
  audio context is created and unlocked on the first click or keypress rather
  than at the moment a phase ends; if it is still blocked, the phase colour and
  an on-screen notice carry the message.
- **Live presence and activity** — who's here, and who last started or paused.
- **Survives everything** — refresh, reconnect, and a late joiner picks up the
  timer mid-flight. Room state is persisted in the Durable Object.
- Light and dark, keyboard `Space` to start/pause, phase shown in the tab title.

## The interface

Built for a browser window rather than a phone screen: a full-width app shell
with a top bar (room code and one-click invite link, connection state), a large
timer stage, and a right rail carrying the people in the room, the timer
lengths as an always-visible inline panel, and the full activity feed. Phase
colour is the only accent — warm red for focus, green for a short break, blue
for a long one — so the room's state is readable across an office. The layout
collapses the rail beneath the stage below 860px, but the desktop window is
what it is designed around.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:8787
```

Open the same room URL in two windows to watch them sync.

With the dev server running, `npm test` drives two WebSocket clients through
the shared timer — start/pause/reset, the skip cycle, custom lengths and their
clamping, presence, and a late joiner inheriting a running clock. `SLOW=1 npm
test` also waits out a real 60-second phase to exercise the storage alarm.

## Deploy to Cloudflare

```bash
npx wrangler login
npm run deploy
```

That publishes the Worker, uploads `public/` as static assets, and creates the
`TimerRoom` Durable Object namespace on first deploy. Wrangler prints the live
`*.workers.dev` URL. Durable Objects with the SQLite storage backend (what this
uses, see the `new_sqlite_classes` migration in `wrangler.jsonc`) are available
on the Workers free plan.

To serve it from your own domain, add a route in `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "pomo.example.com", "custom_domain": true }]
```

## Layout

```
src/index.js      Worker: routes /api/room/<id> to the room, everything else to assets
src/room.js       TimerRoom Durable Object — the shared clock
public/index.html Landing page + room app shell
public/styles.css Layout, theming, phase accent
public/app.js     WebSocket client, clock-offset correction, rendering, chime
```

## Protocol

Client → server: `start`, `pause`, `reset`, `skip`, `phase`, `settings`, `ping`.
Server → client: `welcome` (once, with your identity), `state` (on every
change), `pong`. Every `state` carries the full room snapshot, so a client that
misses a message self-heals on the next one.
