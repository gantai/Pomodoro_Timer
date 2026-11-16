/**
 * TimerRoom — one Durable Object per room.
 *
 * Holds the authoritative timer state for everyone in the room. Clients never
 * count down on their own authority: while running, the server publishes an
 * absolute `endsAt` timestamp plus its own clock, and each client renders
 * `endsAt - (now + skew)`. That keeps every screen in lockstep and makes a
 * refresh (or a laptop waking from sleep) land on the correct time.
 *
 * It also holds the three things that outlive a session: the furniture, the
 * message board and the doodle wall. Those are only wiped by the 30-day sweep
 * or by someone deleting the room outright — the empty-room reset deliberately
 * leaves them alone, because that resets a run, not a room.
 */

import { WALL_W, WALL_H, PEN_COUNT, blankWall, encodeWall, decodeWall } from "../public/pixel/wall.js";

const PHASES = ["focus", "short", "long"];

const DEFAULT_SETTINGS = {
  focus: 25,
  short: 5,
  long: 15,
  roundsBeforeLong: 4,
  // On by default: the point of a shared timer is that the group flows from
  // focus to break together without someone having to click at each handover.
  autoStart: true,
  sound: true,
};

const MAX_LOG = 12;

/**
 * The board. Capped because a Durable Object's storage is not free, but set
 * high enough that a group has to work at it: at 200 a new note pushes the
 * oldest off and the activity feed says so, which is better than refusing to
 * post and better than losing one silently.
 */
const MAX_NOTES = 200;
const MAX_NOTE_LEN = 280;

/** At most this many wall cells in one message — a generous brush stroke. */
const MAX_PAINT = 600;

/** Rooms untouched for this long are wiped — see RoomIndex. */
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a room may sit empty before the next arrival gets a clean timer.
 * Not zero, because a page refresh empties the room for a moment too, and
 * nobody wants a reload to throw away the focus session they're in.
 */
const EMPTY_GRACE = 60_000;
/** Overridable so a test can empty a room in seconds rather than a minute. */
const emptyGrace = (env) => Number(env.EMPTY_GRACE_MS) || EMPTY_GRACE;

function defaultState() {
  return {
    lastSeen: Date.now(),
    emptyAt: null,
    phase: "focus",
    running: false,
    endsAt: null,
    remaining: DEFAULT_SETTINGS.focus * 60_000,
    round: 0,
    completed: 0,
    settings: { ...DEFAULT_SETTINGS },
    layout: DEFAULT_LAYOUT.map((o) => ({ ...o })),
    prevLayout: null,
    log: [],
    guestSeq: 0,
  };
}

const MAX_NAME = 24;

/** Avatars people may pick. Kept in step with public/pixel/art.js. */
const ICON_IDS = ["person", "cat", "dog", "fox", "bunny", "bear", "frog", "owl", "penguin"];
const cleanIcon = (raw) => (ICON_IDS.includes(raw) ? raw : null);

/** Eight hex characters of SHA-256: stable for a browser, useless for guessing it. */
async function memberIdFor(cid) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cid)));
  return [...bytes.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A browser tab's own id, used to recognise a reconnect. Never broadcast:
 * knowing someone's cid would let you take over their place in the room.
 */
const cleanCid = (raw) => (typeof raw === "string" && /^[A-Za-z0-9-]{8,64}$/.test(raw) ? raw : null);

/**
 * How long a socket may go silent before we treat it as dead.
 *
 * Clients ping every 20 seconds, but a backgrounded tab has its timers
 * throttled to roughly once a minute, so the window has to be generous. A
 * live client reaped by mistake simply reconnects and takes its identity
 * back, which costs nothing; a half-open socket left in place is a duplicate
 * person standing in the room, which is what this is here to prevent.
 */
const SOCKET_STALE_MS = 150_000;

/** Furniture people may place. Kept in step with public/pixel/art.js. */
const ITEM_IDS = ["desk", "chair", "sofa", "standdesk", "monitor", "coffee", "counter", "cafetable", "vending", "treadmill", "dumbbells", "shelf", "plant", "window", "clock", "cat", "rug"];
const MAX_ITEMS = 80;

/** The room everyone starts with. Kept in step with DEFAULT_LAYOUT there. */
const DEFAULT_LAYOUT = [
  { i: "rug", x: 96, y: 112 },
  { i: "window", x: 48, y: 3 },
  { i: "clock", x: 100, y: 5 },
  { i: "window", x: 208, y: 3 },
  { i: "shelf", x: 0, y: 20 },
  { i: "shelf", x: 288, y: 20 },
  { i: "desk", x: 16, y: 44 },
  { i: "chair", x: 32, y: 80 },
  { i: "desk", x: 88, y: 44 },
  { i: "chair", x: 104, y: 80 },
  { i: "desk", x: 168, y: 44 },
  { i: "chair", x: 184, y: 80 },
  { i: "standdesk", x: 240, y: 42 },
  { i: "chair", x: 256, y: 80 },
  { i: "treadmill", x: 12, y: 118 },
  { i: "dumbbells", x: 40, y: 162 },
  { i: "plant", x: 76, y: 168 },
  { i: "sofa", x: 135, y: 156 },
  { i: "cat", x: 148, y: 128 },
  { i: "vending", x: 294, y: 118 },
  { i: "counter", x: 240, y: 166 },
  { i: "coffee", x: 250, y: 146 },
  { i: "cafetable", x: 210, y: 154 },
  { i: "chair", x: 190, y: 160 },
  { i: "chair", x: 236, y: 140 },
  { i: "plant", x: 300, y: 168 },
];

/** Items are placed by strangers, so only id and position survive the trip. */
function cleanItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!ITEM_IDS.includes(raw.i)) return null;
  const x = Math.round(Number(raw.x));
  const y = Math.round(Number(raw.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Allowed to hang off the edge a little; not allowed to be lost offscreen.
  return {
    i: raw.i,
    x: Math.max(-48, Math.min(ROOM_W, x)),
    y: Math.max(-24, Math.min(ROOM_H, y)),
  };
}

/** Logical pixel size of the room; positions are clamped to it. */
const ROOM_W = 320;
const ROOM_H = 192;

/**
 * Display names are typed by strangers and rendered in everyone's browser, so
 * they are normalised here rather than trusted. The client escapes on render
 * too; angle brackets are stripped as a second line of defence.
 */
function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
  return name || null;
}

/**
 * Notes are typed by strangers and rendered in everyone's browser, so they
 * are normalised here rather than trusted: control characters out, angle
 * brackets out as a second line of defence behind the client's escaping,
 * runs of blank lines collapsed so one note cannot push the rest off screen.
 */
function cleanNote(raw) {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F<>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_NOTE_LEN);
  return text || null;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeSettings(input, current) {
  const s = input && typeof input === "object" ? input : {};
  return {
    focus: clampInt(s.focus, 1, 180, current.focus),
    short: clampInt(s.short, 1, 180, current.short),
    long: clampInt(s.long, 1, 180, current.long),
    roundsBeforeLong: clampInt(s.roundsBeforeLong, 1, 12, current.roundsBeforeLong),
    autoStart: typeof s.autoStart === "boolean" ? s.autoStart : current.autoStart,
    sound: typeof s.sound === "boolean" ? s.sound : current.sound,
  };
}

export class TimerRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = defaultState();
    // Kept under their own storage keys rather than inside `state`: the timer
    // blob is rewritten on every start, pause and phase change, and dragging
    // the notes and the wall through each of those writes would be waste.
    this.notes = [];
    this.wall = blankWall();
    this.wallPrev = null;
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get("state");
      if (!stored) return;
      // Belt and braces: the index sweeps stale rooms daily, but if one is
      // reopened after 30 days before the sweep reaches it, start it fresh
      // rather than resurrecting month-old settings.
      if (stored.lastSeen && Date.now() - stored.lastSeen > THIRTY_DAYS) {
        await ctx.storage.deleteAll();
        return;
      }
      this.state = { ...defaultState(), ...stored };
      // The sit-stand stool is now a monitor, which is what everyone read it
      // as. Rooms saved before that still hold "stool" items; an id no longer
      // in the catalogue would simply stop being drawn, so rewrite them.
      for (const item of this.state.layout) if (item.i === "stool") item.i = "monitor";
      const [notes, wall, wallPrev] = await Promise.all([
        ctx.storage.get("notes"),
        ctx.storage.get("wall"),
        ctx.storage.get("wallPrev"),
      ]);
      if (Array.isArray(notes)) this.notes = notes;
      this.wall = (wall && decodeWall(wall)) || blankWall();
      this.wallPrev = (wallPrev && decodeWall(wallPrev)) || null;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Internal, from RoomIndex's pruning alarm. Not reachable from outside:
    // the Worker only ever forwards /api/room/<id> here.
    if (url.pathname === "/expire") {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, "room expired");
      await this.ctx.storage.deleteAll();
      this.state = defaultState();
      this.notes = [];
      this.wall = blankWall();
      this.wallPrev = null;
      return new Response("expired");
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    this.roomId = request.headers.get("X-Room-Id") || this.roomId || this.state.roomId;
    if (this.roomId && this.state.roomId !== this.roomId) this.state.roomId = this.roomId;
    this.state.lastSeen = Date.now();
    this.touchIndex();
    await this.settleEmptyRoom();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // A reconnect is not a new person. Without this, every socket minted a
    // fresh identity, so a reload or a dropped connection showed up twice in
    // everyone else's room until the dead socket was finally noticed — which
    // over a real network can take a while.
    // Clear out anything that has stopped answering before working out who
    // is in the room, so a dead socket never greets the new arrival.
    this.reapStale();

    const cid = cleanCid(url.searchParams.get("cid"));
    const takeover = cid ? this.evictPrevious(cid) : null;

    if (!takeover) this.state.guestSeq += 1;
    const member = {
      // The id is derived from the browser's handle, not minted. After a
      // deploy or a restart every socket is gone, so nothing is there to
      // take over from; a minted id would be new, and everyone's character
      // would be rebuilt at the starting seats in a new colour. A derived
      // one survives, so the room picks up exactly where it was. One-way,
      // so it does not leak the handle it came from.
      id: takeover ? takeover.id : cid ? await memberIdFor(cid) : crypto.randomUUID().slice(0, 8),
      cid,
      name:
        cleanName(url.searchParams.get("name")) ||
        takeover?.name ||
        `Guest ${this.state.guestSeq}`,
      icon: cleanIcon(url.searchParams.get("icon")) || takeover?.icon || "person",
    };
    // Hibernation-safe: the attachment survives the DO being evicted.
    server.serializeAttachment(member);
    this.ctx.acceptWebSocket(server);
    await this.save();

    // Reusing the id keeps their position and their place in the room, so a
    // reload is invisible to everyone else — no "left", no "joined". When the
    // old socket's close landed first there is nothing to take over, but the
    // id is derived from the browser so it is the same person back: pull the
    // "left" that was just logged rather than adding a "joined" under it.
    const leftAt = this.recentLeaves?.get(member.id);
    if (!takeover && leftAt && Date.now() - leftAt < 8_000) {
      this.recentLeaves.delete(member.id);
      const k = this.state.log.findIndex((e) => e.k === "left" && e.a?.name === member.name);
      if (k >= 0) this.state.log.splice(k, 1);
    } else if (!takeover) {
      this.addLog("joined", { name: member.name });
    }
    this.broadcast();
    server.send(
      JSON.stringify({
        type: "welcome",
        you: member,
        layout: this.state.layout,
        notes: this.notes,
        wall: encodeWall(this.wall),
        positions: [...(this.positions || new Map())].map(([id, p]) => ({ id, ...p })),
        ...this.snapshot(),
      }),
    );

    // Everyone already here is asked to say where they are. Positions live in
    // memory only, so after a restart there is nothing to hand the arrival;
    // the people still standing in the room know, and they tell it.
    this.sendAll({ type: "roll" }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }

    const me = ws.deserializeAttachment() || { name: "Someone" };
    const s = this.state;
    const now = Date.now();
    (this.seenAt ||= new Map()).set(ws, now);

    // Movement is relayed, never stored. It must not fall through to the
    // save-and-broadcast below: at ~10 updates a second per walker that would
    // mean a storage write and a full timer broadcast per step.
    if (msg.type === "move") {
      this.relayMove(ws, me, msg);
      return;
    }

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", serverTime: now, echo: msg.echo }));
      // Pings are the room's heartbeat, so they are also when it tidies up
      // after anyone who stopped answering — no new arrival required.
      const every = Math.min(30_000, (Number(this.env.SOCKET_STALE_MS) || SOCKET_STALE_MS) / 3);
      if (now - (this.lastReap || 0) > every) {
        this.lastReap = now;
        if (this.reapStale() > 0) {
          await this.save();
          this.broadcast();
        }
      }
      return;
    }

    s.lastSeen = now;
    this.touchIndex();

    switch (msg.type) {
      case "start": {
        if (s.running) return;
        if (s.remaining <= 0) s.remaining = this.phaseDuration(s.phase);
        s.running = true;
        s.endsAt = now + s.remaining;
        await this.ctx.storage.setAlarm(s.endsAt);
        this.addLog("started", { name: me.name, phase: s.phase });
        break;
      }

      case "pause": {
        if (!s.running) return;
        s.remaining = Math.max(0, s.endsAt - now);
        s.running = false;
        s.endsAt = null;
        await this.ctx.storage.deleteAlarm();
        this.addLog("paused", { name: me.name });
        break;
      }

      case "reset": {
        s.running = false;
        s.endsAt = null;
        s.remaining = this.phaseDuration(s.phase);
        await this.ctx.storage.deleteAlarm();
        this.addLog("reset", { name: me.name });
        break;
      }

      case "skip": {
        const from = s.phase;
        await this.advance(false);
        this.addLog("skipped", { name: me.name, phase: from });
        break;
      }

      case "phase": {
        if (!PHASES.includes(msg.phase) || msg.phase === s.phase) return;
        s.phase = msg.phase;
        s.running = false;
        s.endsAt = null;
        s.remaining = this.phaseDuration(s.phase);
        await this.ctx.storage.deleteAlarm();
        this.addLog("switched", { name: me.name, phase: s.phase });
        break;
      }

      case "name": {
        const next = cleanName(msg.name);
        if (!next || next === me.name) return;
        const was = me.name;
        ws.serializeAttachment({ ...me, name: next });
        this.addLog("renamed", { was, name: next });
        break;
      }

      case "icon": {
        const next = cleanIcon(msg.icon);
        if (!next || next === me.icon) return;
        ws.serializeAttachment({ ...me, icon: next });
        break;
      }

      // ── decorating ──────────────────────────────────────────────────────
      // Each edit is one item, not the whole room: the messages stay tiny and
      // two people rearranging at once merge instead of overwriting.
      case "place": {
        const item = cleanItem(msg);
        if (!item) return;
        if (s.layout.length >= MAX_ITEMS) {
          ws.send(JSON.stringify({ type: "notice", key: "dec.full" }));
          return;
        }
        s.prevLayout = s.layout.map((o) => ({ ...o }));
        s.layout = [...s.layout, item];
        this.addLog("added", { name: me.name, item: item.i });
        await this.save();
        this.broadcastLayout();
        this.broadcast();
        return;
      }

      case "removeItem": {
        const k = Math.round(Number(msg.index));
        if (!Number.isInteger(k) || k < 0 || k >= s.layout.length) return;
        const gone = s.layout[k];
        s.prevLayout = s.layout.map((o) => ({ ...o }));
        s.layout = s.layout.filter((_, n) => n !== k);
        this.addLog("removed", { name: me.name, item: gone.i });
        await this.save();
        this.broadcastLayout();
        this.broadcast();
        return;
      }

      case "resetLayout": {
        s.prevLayout = s.layout.map((o) => ({ ...o }));
        s.layout = DEFAULT_LAYOUT.map((o) => ({ ...o }));
        this.addLog("layoutReset", { name: me.name });
        await this.save();
        this.broadcastLayout();
        this.broadcast();
        return;
      }

      case "undoLayout": {
        if (!s.prevLayout) return;
        const back = s.prevLayout;
        s.prevLayout = s.layout.map((o) => ({ ...o }));
        s.layout = back;
        this.addLog("layoutUndo", { name: me.name });
        await this.save();
        this.broadcastLayout();
        this.broadcast();
        return;
      }

      // ── the message board ───────────────────────────────────────────────
      // Notes outlive everyone in the room, which is the whole point of them,
      // so they are stored rather than relayed. They travel one at a time for
      // the same reason the furniture does.
      case "note": {
        const text = cleanNote(msg.text);
        if (!text) return;
        const note = {
          id: crypto.randomUUID().slice(0, 8),
          by: me.id,
          name: me.name,
          icon: me.icon || "person",
          text,
          at: now,
        };
        this.notes.push(note);
        let dropped = null;
        if (this.notes.length > MAX_NOTES) dropped = this.notes.shift();
        this.addLog("noted", { name: me.name });
        await this.saveNotes();
        this.sendAll({ type: "note", note, dropped: dropped?.id || null });
        if (dropped) ws.send(JSON.stringify({ type: "notice", key: "board.full" }));
        this.broadcast();
        return;
      }

      // Anyone may take any note down, exactly as anyone may move the
      // furniture. There are no accounts here, so there is nobody to enforce
      // ownership against — the activity feed names who did it instead.
      case "unnote": {
        const k = this.notes.findIndex((n) => n.id === msg.id);
        if (k < 0) return;
        this.notes.splice(k, 1);
        this.addLog("unnoted", { name: me.name });
        await this.saveNotes();
        this.sendAll({ type: "unnote", id: msg.id });
        this.broadcast();
        return;
      }

      // ── the doodle wall ─────────────────────────────────────────────────
      // Only the cells that changed travel, and the save is debounced: a
      // drag is dozens of messages a second and each one must not be a
      // storage write.
      case "paint": {
        if (!Array.isArray(msg.cells) || msg.cells.length === 0) return;
        const seen = (this.lastPaint ||= new WeakMap());
        if (now - (seen.get(ws) || 0) < 40) return;
        seen.set(ws, now);

        const applied = [];
        for (const cell of msg.cells.slice(0, MAX_PAINT)) {
          if (!Array.isArray(cell) || cell.length !== 3) continue;
          const [x, y, c] = cell;
          if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(c)) continue;
          if (x < 0 || y < 0 || x >= WALL_W || y >= WALL_H || c < 0 || c >= PEN_COUNT) continue;
          const at = y * WALL_W + x;
          if (this.wall[at] === c) continue;
          this.wall[at] = c;
          applied.push([x, y, c]);
        }
        if (!applied.length) return;
        this.scheduleWallSave();
        this.sendAll({ type: "painted", cells: applied }, ws);
        return;
      }

      case "clearWall": {
        if (this.wall.every((c) => c === 0)) return;
        this.wallPrev = this.wall.slice();
        this.wall = blankWall();
        this.addLog("wallCleared", { name: me.name });
        await this.saveWall();
        this.sendAll({ type: "wall", wall: encodeWall(this.wall) });
        this.broadcast();
        return;
      }

      case "undoWall": {
        if (!this.wallPrev) return;
        const back = this.wallPrev;
        this.wallPrev = this.wall.slice();
        this.wall = back;
        this.addLog("wallUndo", { name: me.name });
        await this.saveWall();
        this.sendAll({ type: "wall", wall: encodeWall(this.wall) });
        this.broadcast();
        return;
      }

      // ── deleting the room ───────────────────────────────────────────────
      // The one irreversible thing here, and anyone holding the link can
      // reach it, so the client makes you type the room's name and the
      // server checks it again rather than trusting that it did.
      case "deleteRoom": {
        const id = this.roomId || this.state.roomId;
        if (!id || msg.confirm !== id) return;
        this.sendAll({ type: "deleted", by: me.name });
        for (const other of this.ctx.getWebSockets()) {
          try {
            other.close(4002, "room deleted");
          } catch {
            /* already gone */
          }
        }
        this.forgetInIndex(id);
        await this.ctx.storage.deleteAll();
        this.state = defaultState();
        this.notes = [];
        this.wall = blankWall();
        this.wallPrev = null;
        this.positions?.clear();
        return;
      }

      case "settings": {
        const next = sanitizeSettings(msg.settings, s.settings);
        const changed = PHASES.filter((p) => next[p] !== s.settings[p]);
        s.settings = next;
        // A length change applies immediately when idle; while the clock is
        // running we leave the current phase alone and apply it next phase.
        if (!s.running) s.remaining = this.phaseDuration(s.phase);
        if (changed.length) {
          this.addLog("lengths", { name: me.name, parts: changed.map((p) => ({ phase: p, n: next[p] })) });
        }
        break;
      }

      default:
        return;
    }

    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws) {
    const me = ws.deserializeAttachment();
    // A socket we replaced ourselves: its identity already moved to the new
    // connection, so there is nothing to announce and nobody has left.
    if (this.isZombie(ws, me)) {
      this.zombies?.delete(ws);
      return;
    }
    if (me) {
      this.addLog("left", { name: me.name });
      this.positions?.delete(me.id);
      (this.recentLeaves ||= new Map()).set(me.id, Date.now());
    }
    // The socket is still listed until this handler returns, so exclude it.
    await this.markEmptyIfLast(ws);
    this.broadcast(ws);
    await this.save();
  }

  async webSocketError(ws) {
    await this.markEmptyIfLast(ws);
    this.broadcast(ws);
    await this.save();
  }

  /**
   * The last person just left. Stop the clock from advancing phases (and
   * chiming) to an empty room, and note when it emptied — the decision about
   * whether to reset is made lazily, when somebody next arrives, because
   * nothing needs to happen in between.
   */
  async markEmptyIfLast(leaving) {
    if (this.members(leaving).length > 0) return;
    if (this.wallDirty) await this.saveWall();
    this.state.emptyAt = Date.now();
    await this.ctx.storage.deleteAlarm();
  }

  /**
   * Someone is arriving. If the room sat empty longer than the grace window,
   * hand them a fresh timer rather than whatever the last group left running.
   * Inside the window — a refresh, a dropped connection — pick up where it
   * left off, alarm and all.
   */
  async settleEmptyRoom() {
    const s = this.state;
    if (s.emptyAt === null) return;

    const idle = Date.now() - s.emptyAt;
    const overran = s.running && s.endsAt !== null && s.endsAt <= Date.now();
    s.emptyAt = null;

    if (idle <= emptyGrace(this.env) && !overran) {
      // Back within the grace window: resume. `endsAt` is absolute, so the
      // clock reads correctly without any adjustment.
      if (s.running && s.endsAt !== null) await this.ctx.storage.setAlarm(s.endsAt);
      return;
    }

    s.phase = "focus";
    s.round = 0;
    s.running = false;
    s.endsAt = null;
    s.remaining = this.phaseDuration("focus");
    await this.ctx.storage.deleteAlarm();
    this.addLog("allLeft");
  }

  async alarm() {
    const s = this.state;
    if (!s.running || !s.endsAt) return;
    if (Date.now() < s.endsAt - 250) {
      // Woke early (clock skew); re-arm rather than firing the phase change.
      await this.ctx.storage.setAlarm(s.endsAt);
      return;
    }
    const finished = await this.advance(true);
    await this.save();
    this.broadcast({ chime: finished });
  }

  /** Move to the next phase in the pomodoro cycle. */
  async advance(elapsed) {
    const s = this.state;
    const finishedPhase = s.phase;

    if (finishedPhase === "focus") {
      if (elapsed) s.completed += 1;
      s.round += 1;
      s.phase = s.round % s.settings.roundsBeforeLong === 0 ? "long" : "short";
    } else {
      if (finishedPhase === "long") s.round = 0;
      s.phase = "focus";
    }

    s.remaining = this.phaseDuration(s.phase);
    await this.ctx.storage.deleteAlarm();

    if (s.settings.autoStart) {
      s.running = true;
      s.endsAt = Date.now() + s.remaining;
      await this.ctx.storage.setAlarm(s.endsAt);
    } else {
      s.running = false;
      s.endsAt = null;
    }

    if (elapsed) {
      this.addLog("finished", { from: finishedPhase, to: s.phase });
    }
    return finishedPhase;
  }

  /**
   * Record this room in the index so the 30-day sweep can find it. Rate
   * limited: a busy room would otherwise hammer the single index object on
   * every click, and day-granularity is all the expiry needs.
   */
  touchIndex() {
    const now = Date.now();
    if (!this.roomId || now - (this.lastTouch || 0) < 60 * 60 * 1000) return;
    this.lastTouch = now;
    const stub = this.env.INDEX.get(this.env.INDEX.idFromName("v1"));
    this.ctx.waitUntil(
      stub
        .fetch("https://index/touch", {
          method: "POST",
          body: JSON.stringify({ id: this.roomId, at: now }),
        })
        .catch(() => {
          this.lastTouch = 0; // let the next visitor retry
        }),
    );
  }

  /**
   * Relay one person's position to everyone else.
   *
   * Positions live in memory only — never in storage. They are disposable:
   * if this object hibernates and forgets them, the next person to arrive
   * triggers a re-send (see "here" below) and the room fills back in.
   * The sender's id comes from their socket, not the message, so nobody can
   * move somebody else's character.
   */
  relayMove(ws, me, msg) {
    const now = Date.now();
    const seen = this.lastMove || (this.lastMove = new WeakMap());
    if (now - (seen.get(ws) || 0) < 40) return; // ~25/sec ceiling per person
    seen.set(ws, now);

    const x = Number(msg.x);
    const y = Number(msg.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const pos = {
      x: Math.max(0, Math.min(ROOM_W, Math.round(x))),
      y: Math.max(0, Math.min(ROOM_H, Math.round(y))),
      d: [0, 1, 2, 3].includes(msg.d) ? msg.d : 0,
      moving: msg.moving === true,
    };

    this.positions ||= new Map();
    this.positions.set(me.id, pos);

    const payload = JSON.stringify({ type: "pos", id: me.id, ...pos });
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws || this.zombies?.has(other)) continue;
      try {
        other.send(payload);
      } catch {
        /* going away; the close handler tidies up */
      }
    }
  }

  /**
   * The layout goes out on its own, not folded into the timer snapshot: it
   * only changes while someone is decorating, and putting a kilobyte of
   * furniture on every start and pause would be waste.
   */
  broadcastLayout() {
    const payload = JSON.stringify({ type: "layout", layout: this.state.layout });
    for (const ws of this.ctx.getWebSockets()) {
      if (this.isZombie(ws)) continue;
      try {
        ws.send(payload);
      } catch {
        /* going away */
      }
    }
  }

  /** Send one payload to everyone still really in the room. */
  sendAll(payload, except) {
    const body = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || this.isZombie(ws)) continue;
      try {
        ws.send(body);
      } catch {
        /* going away; the close handler tidies up */
      }
    }
  }

  saveNotes() {
    return this.ctx.storage.put("notes", this.notes);
  }

  async saveWall() {
    this.wallDirty = false;
    await this.ctx.storage.put("wall", encodeWall(this.wall));
    if (this.wallPrev) await this.ctx.storage.put("wallPrev", encodeWall(this.wallPrev));
  }

  /**
   * Drawing is a stream of small edits; writing storage on each one would be
   * absurd. Coalesce a second of drawing into one write, and hold the object
   * awake for it with waitUntil so a hibernation cannot swallow the last
   * stroke. Worst case a crash costs the final second of a doodle.
   */
  scheduleWallSave() {
    this.wallDirty = true;
    if (this.wallSaving) return;
    this.wallSaving = true;
    this.ctx.waitUntil(
      new Promise((done) => setTimeout(done, 1000)).then(async () => {
        this.wallSaving = false;
        if (this.wallDirty) await this.saveWall();
      }),
    );
  }

  /** Drop a deleted room from the index, so the sweep has nothing to find. */
  forgetInIndex(id) {
    const stub = this.env.INDEX.get(this.env.INDEX.idFromName("v1"));
    this.ctx.waitUntil(
      stub.fetch("https://index/forget", { method: "POST", body: JSON.stringify({ id }) }).catch(() => {
        // The sweep drops entries whose room is already gone, so a missed
        // forget costs an orphaned timestamp for up to thirty days.
      }),
    );
  }

  phaseDuration(phase) {
    return this.state.settings[phase] * 60_000;
  }

  /**
   * One entry = a key plus its arguments, never a finished sentence. The
   * sentence is built in the reader's own language when it is rendered, so
   * the same event reads correctly for an English and a Chinese reader
   * sitting in the same room. Entries written before this change carry
   * `text` instead and are shown as they were.
   */
  addLog(k, a) {
    this.state.log.unshift(a ? { k, a, ts: Date.now() } : { k, ts: Date.now() });
    this.state.log = this.state.log.slice(0, MAX_LOG);
  }

  /**
   * Drop sockets we have not heard from in a long time.
   *
   * This is the backstop that does not depend on the client: a browser
   * running an old cached build, or a connection that died without a close
   * frame, would otherwise stand in the room indefinitely. Every message
   * counts as a sign of life, and clients have pinged every 20 seconds since
   * long before any of this.
   */
  reapStale() {
    const seen = (this.seenAt ||= new Map());
    const now = Date.now();
    // Overridable so tests can age a socket out in seconds instead of minutes.
    const staleMs = Number(this.env.SOCKET_STALE_MS) || SOCKET_STALE_MS;
    let dropped = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if (this.isZombie(ws)) continue;
      const at = seen.get(ws);
      if (at === undefined) {
        // First sight of this socket — after a hibernation that is every
        // socket, so give them all a full window before judging them.
        seen.set(ws, now);
        continue;
      }
      if (now - at < staleMs) continue;

      seen.delete(ws);
      this.zombies ||= new WeakSet();
      this.zombies.add(ws);
      const att = ws.deserializeAttachment();
      if (att) {
        try {
          ws.serializeAttachment({ ...att, zombie: true });
        } catch {
          /* already closing */
        }
        this.positions?.delete(att.id);
        this.addLog("dropped", { name: att.name });
      }
      try {
        ws.close(4001, "no sign of life");
      } catch {
        /* already gone */
      }
      dropped++;
    }
    return dropped;
  }

  /**
   * Close any socket already held by this browser and hand its identity to
   * the new one. Evicted sockets are parked in `zombies` so they stop
   * counting as members the moment they are replaced, rather than when their
   * close event eventually lands.
   */
  evictPrevious(cid) {
    let previous = null;
    for (const old of this.ctx.getWebSockets()) {
      const att = old.deserializeAttachment();
      if (!att || att.cid !== cid || att.zombie) continue;
      previous = att;
      this.zombies ||= new WeakSet();
      this.zombies.add(old);
      // Tell it in a message rather than relying on the close code: a close
      // handshake can stall, and then the abandoned window would sit there
      // looking connected for as long as it stayed open.
      try {
        old.send(JSON.stringify({ type: "replaced" }));
      } catch {
        /* already gone */
      }
      // The WeakSet is memory, which a hibernation would forget; the
      // attachment is not. Mark both so an evicted socket can never come
      // back as a second copy of somebody.
      try {
        old.serializeAttachment({ ...att, zombie: true });
      } catch {
        /* closing already */
      }
      try {
        old.close(4000, "replaced by a newer connection");
      } catch {
        /* already gone */
      }
    }
    return previous;
  }

  /** Evicted sockets stop counting the moment they are replaced. */
  isZombie(ws, att) {
    if (this.zombies?.has(ws)) return true;
    return (att || ws.deserializeAttachment())?.zombie === true;
  }

  members(exclude) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const att = ws.deserializeAttachment();
      if (!att || this.isZombie(ws, att)) continue;
      // cid is this tab's secret handle on its identity — never send it out.
      out.push({ id: att.id, name: att.name, icon: att.icon });
    }
    return out;
  }

  snapshot(exclude) {
    const s = this.state;
    return {
      phase: s.phase,
      running: s.running,
      endsAt: s.endsAt,
      remaining: s.remaining,
      round: s.round,
      completed: s.completed,
      settings: s.settings,
      log: s.log,
      members: this.members(exclude),
      serverTime: Date.now(),
    };
  }

  broadcast(excludeOrExtra) {
    const exclude = excludeOrExtra instanceof WebSocket ? excludeOrExtra : undefined;
    const extra = exclude ? {} : excludeOrExtra || {};
    const payload = JSON.stringify({ type: "state", ...this.snapshot(exclude), ...extra });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude || this.zombies?.has(ws)) continue;
      try {
        ws.send(payload);
      } catch {
        // Socket is on its way out; the close handler will tidy up.
      }
    }
  }

  save() {
    return this.ctx.storage.put("state", this.state);
  }
}
