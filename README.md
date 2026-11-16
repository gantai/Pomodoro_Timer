# Pomo Together

### ▶ **[pomodoro-timer.johnyip414.workers.dev](https://pomodoro-timer.johnyip414.workers.dev/)**

A Pomodoro timer a group of people can share. One person creates a room, sends
the link, and everyone's clock counts down together — start, pause, skip and
timer lengths are all shared, in real time.

Free to use, open to anyone. No accounts, no database, no build step. Runs
entirely on Cloudflare Workers. In English and 简体中文.

## Using it

1. Open **[the timer](https://pomodoro-timer.johnyip414.workers.dev/)** and hit
   *Create a room* — or type a name like `design-standup` to get a link your
   group can reuse every day.
2. Send that link to everyone. They pick a display name and join; there is
   nothing to sign up for or install, and anyone who would rather not be named
   can stay a guest.
3. Anyone in the room can start, pause, skip, or change the focus and break
   lengths. Every screen stays in step, and a chime marks the end of each
   session.

A room keeps its settings, its furniture, its notes and its doodle wall for
as long as you keep using it, and is deleted after 30 days without use — or
whenever somebody uses **Delete this room**. Anyone holding the link can control that room's
timer, so share it the way you would a meeting link.

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
  control the timer.
- **Pick an icon.** Nine avatars — a person plus cat, dog, fox, bunny, bear,
  frog, owl and penguin — chosen in the same dialog as your name and changed
  any time from the rail. Your choice is remembered across rooms, travels on
  the WebSocket handshake, and is validated against the roster server-side, so
  a hand-made request cannot inject one. Animals have a single pose facing the
  viewer; the person keeps three facings, because a human walking away looks
  wrong where a cat that always faces you just looks like a cat.
- **Display names.** You're asked for one the first time you join a room, then
  it's remembered across rooms and visits; "Change your name" in the rail
  updates it for everyone live. Staying anonymous is a real choice — skip and
  you're `Guest 3`, and you won't be asked again. Names are normalised
  server-side (control characters and angle brackets stripped, 24-character
  cap) and escaped on render, since they're typed by strangers and displayed
  in everyone's browser. A name chosen up front rides along on the WebSocket
  handshake, so nobody sees a flash of `Guest 4` before it resolves.
- **The same link every day.** A room keeps its settings, so a group can
  bookmark one address and reuse it indefinitely. Name your own
  (`/r/design-standup`) by typing it on the landing page — a room is created
  the first time someone opens it, so there is no "create" step to get wrong.
  The landing page also lists the rooms this browser has opened, newest first.
- **Rooms expire after 30 days without use.** `RoomIndex`, a single Durable
  Object, records each room's last use and sweeps daily, wiping the storage of
  anything untouched for 30 days. The room list is kept per-browser in
  `localStorage`, never server-side: a public list of live rooms would let
  anyone enumerate them and reset a group's timer.
- **Custom lengths** — focus, short break and long break are each free to set
  from 1 to 180 minutes, plus how many rounds precede a long break. Changes
  apply to everyone. Presets: Classic 25/5/15, Deep 50/10/30, Sprint 15/3/15.
- **Full cycle** — focus → short break → focus → … → long break, with an
  auto-start for the next phase, on by default so the group flows from focus
  to break without anyone clicking at the handover. It governs handovers only:
  a new room still waits for somebody to press Start.
- **An empty room resets itself.** When the last person leaves, the clock stops
  advancing (no phases turning over, no chimes, to nobody), and the next person
  to arrive gets a stopped timer at the top of a fresh focus phase — the room's
  timer lengths are kept, only the run is discarded. The reset is deferred by a
  60-second grace window, because a page refresh empties a room for a moment
  too and a reload should not cost you the session you're in; come back inside
  that window and the timer is exactly where you left it, deadline included.
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
- **A room you can walk around.** The stage is a top-down pixel study — desks,
  one of them a sit-stand desk, bookshelves, plants, a rug, a cat — with the
  countdown as a HUD over it.
  Everyone has a character labelled with their display name — the tag is hung
  by its underside from just above the head, so it clears the character at
  every scale rather than covering their face — and coloured deterministically
  from their id, so you look the same to everyone. Walk with
  the arrow keys or WASD, or click where you want to go; only the walls stop
  you, so you can stand at a desk rather than beside it. Phase colour becomes
  the room's light: warm lamps on focus, cooler on a break. **Hide the room**
  in the rail swaps back to a plain clock, remembered per browser.
- **Decorate it together.** *Decorate the room* opens a tray of furniture —
  desks, chairs, a brown two-seat sofa, an electric sit-stand desk with the
  perching stool that goes with it, shelves, plants, windows, a clock, a rug,
  a cat — and clicking
  the room places the selected piece on an 8px grid; the eraser takes things
  away. Every change is shared, persisted with the room and covered by the
  same 30-day expiry, so a group's arrangement is still there tomorrow. Undo
  steps back one change for everyone, and *Reset room* restores the original
  furniture behind a confirm. Edits travel one item at a time rather than as
  a whole layout, so two people rearranging at once merge instead of
  overwriting each other.
- **A message board (留言板).** A panel in the rail, not a dialog behind a
  button: the notes are simply there, with the latest first and a badge when
  something arrived since you last looked. They outlive every session in the
  room and go only when the room does. Anyone can take any note down, exactly
  as anyone can move the furniture — there are no accounts here, so there is
  nobody to enforce ownership against, and the activity feed names who did it
  instead. 280 characters a note, 200 notes a board; at 200 the oldest is
  pushed off and the feed says so, rather than refusing the post or losing one
  silently.
- **A doodle wall (涂鸦墙)** below the room, exactly as wide and drawn at the
  same pixel size, so it reads as part of the same world. Thirteen pens, three
  nib sizes and an eraser; everyone draws on it at once. It is a fixed grid of
  cells rather than a list of strokes, which is what makes "it stays until the
  room is deleted" a promise worth making: a stroke list grows without limit
  and would eventually have to start discarding the oldest, while a grid costs
  the same blank or covered. Only changed cells travel, so two people drawing
  at once merge instead of overwriting, and a second of drawing is one storage
  write rather than fifty.
- **Deleting a room.** The one irreversible thing here, and anyone with the
  link can reach it, so it asks you to type the room's name and the server
  checks it again rather than trusting that it did. Everything goes at once —
  furniture, notes, wall, lengths, log — and everyone still in the room is sent
  back to the start page. The link keeps working: a room is created by visiting
  it, so reopening the address gives you a new empty one.
- **English and 简体中文**, switched from the top bar. The choice is
  per-person, not per-room: two people in the same room may not read the same
  language, and a shared setting would mean one of them loses. The activity
  feed is stored as keys and arguments rather than finished sentences, so the
  same event reads correctly for an English and a Chinese reader at the same
  moment.
- Light and dark, phase and remaining time shown in the tab title. The timer is
  driven by the on-screen controls only — there is deliberately no keyboard
  shortcut, so a stray keypress cannot reset a room everyone is working in.

## The interface

Built for a browser window rather than a phone screen: a full-width app shell
with a top bar (room code and one-click invite link, language, connection
state), and a stage that reads top-down — phase, controls, progress, then the
room, then the doodle wall beneath it at the same pixel size. The right rail
carries the people, a "this room" panel of actions, the message board, the
timer lengths, and the activity feed folded shut at the bottom, since it is
useful but rarely urgent. Phase
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

`npm run test:expiry` needs no server: it runs the 30-day sweep against a stub
storage layer, so rooms can be aged arbitrarily without waiting a month.

`public/_headers` sets `Cache-Control: no-cache` on everything. Nothing here
is content-hashed — the app is `/app.js` and `/styles.css` by those names,
forever — so without it a browser may keep a copy indefinitely, and Safari
does: a Mac was found running a layout several deploys old. `no-cache` means
revalidate before use, not "don't store", so the file is still cached and
still answered with an empty 304 when it hasn't changed.

Safari also needs `-webkit-` on `backdrop-filter` and `mask-image`, or the
HUD loses its blur and the message board loses the fade at its scroll edge;
and it refuses to toggle a `<details>` whose `<summary>` has had its `display`
changed, which is why the activity fold's flex row is a span inside the
summary rather than the summary itself.

`npm run test:lasting` checks what a room keeps when everyone goes home — the
empty-room reset must clear the run and leave the furniture, the board and the
wall alone — and that deleting really does take all of it. It wants a server
started with `--var EMPTY_GRACE_MS:1200`, since otherwise the test would have
to sit out the full 60-second grace window.

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
src/roomIndex.js  RoomIndex Durable Object — last-use record and the 30-day sweep
public/i18n.js         English and 简体中文, and the activity feed's sentences
public/pixel/art.js    palette, sprites-as-text, per-person colours
public/pixel/wall.js   the doodle wall's grid and codec — shared by both ends
public/pixel/scene.js  backdrop baking, movement, placement, renderer
public/index.html Landing page + room app shell
public/styles.css Layout, theming, phase accent
public/app.js     WebSocket client, clock-offset correction, rendering, chime
```

## Protocol

Client → server: `start`, `pause`, `reset`, `skip`, `phase`, `settings`,
`name`, `icon`, `place`, `removeItem`, `resetLayout`, `undoLayout`, `note`,
`unnote`, `paint`, `clearWall`, `undoWall`, `deleteRoom`, `move`, `ping`. A display name and icon may also be supplied as `?name=` and `?icon=`
on the WebSocket URL, which is how they are set at join time.

Server → client: `welcome` (once, with your identity, the furniture, the notes
and the wall), `state` (on every change), `layout`, `note`, `unnote`,
`painted`, `wall`, `pos`, `replaced`, `deleted`, `notice`, `pong`. Every
`state` carries the full room snapshot, so a client that misses a message
self-heals on the next one.

The notes and the wall live under their own storage keys rather than inside
the timer's state blob, which is rewritten on every start, pause and phase
change. Painting is debounced into roughly one write a second and flushed when
the room empties; the activity log stores `{k, a}` — a key and its arguments —
so the sentence can be built in each reader's own language.

The furniture layout goes out on its own `layout` message and in the welcome,
not folded into the timer snapshot: it only changes while someone is
decorating, and putting a kilobyte of furniture on every start and pause
would be waste. Item ids are validated against the catalogue and positions
clamped server-side, the same posture as names and icons.

`move` is deliberately separate from everything else: it is relayed to the
other sockets as `pos` and never written to storage or mixed into the timer
broadcast. At ten updates a second per walker, doing otherwise would mean a
storage write and a full state broadcast per footstep. Positions live in the
object's memory only; if it hibernates and forgets them, the next arrival
prompts everyone to re-send theirs once.

## One person, one character

A browser carries its own id, sent when it connects. A connection whose id
matches one already in the room takes that identity over: the old socket is
closed and the new one inherits the member id, position and name tag, so a
reload — or opening the room in a second window — never leaves a second copy
of you standing there. The window that loses the room is told so explicitly in
a message rather than through a close code, because a close handshake can
stall and leave an abandoned window looking connected. The id is never
broadcast: anyone holding it could take your place.

Behind that sits a backstop that needs nothing from the client. Sockets that
stop answering are dropped after two and a half minutes of silence — clients
have pinged every twenty seconds since long before any of this — so a
connection that died without a close frame, or a browser running an old cached
build, cannot stand in the room indefinitely. `npm run test:stale` exercises
it against a server started with `--var SOCKET_STALE_MS:4000`; the window has
to stay several times the ping interval, or a backgrounded tab with throttled
timers gets reaped while it is perfectly alive.

## Drawing the room without an asset pack

Every sprite is a grid of characters mapped through a shared palette, blitted
a pixel at a time onto a canvas with a fixed 320×192 logical buffer scaled by
a whole number. Text sprites are diffable, weigh almost nothing, and recolour
for free — which is how one character drawing becomes everybody in the room.
Only three poses are hand-drawn (facing the viewer, away, and side); the walk
cycles are derived by lifting one foot and then the other, which is the
difference between about 45 lines of art and about 400.

The sofa is the one sprite not typed out by hand: it is all clipped corners
and a derived outline, and keeping that as literal text means recounting
every row below any change. `tools/draw-sofa.mjs` draws it as shapes and
prints the array to paste back in. What makes a chesterfield legible from
directly above, roughly in order: clipped corners (square ones read as
joinery however the thing is coloured), three cushions rather than two (two
is a bench), slim arms (chunky ones put the box back), one row of buttons on
the back, and tan lit along the top edge, since leather has a sheen that
matte fabric does not.

The room's fixed parts — floor, walls, the light for the current phase — and
its furniture are baked together into an offscreen canvas and drawn as a
single image per frame, so a room full of furniture costs no more to animate
than an empty one. It re-bakes only when the layout or the phase changes.
