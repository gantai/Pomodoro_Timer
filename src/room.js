/**
 * TimerRoom — one Durable Object per room.
 *
 * Holds the authoritative timer state for everyone in the room. Clients never
 * count down on their own authority: while running, the server publishes an
 * absolute `endsAt` timestamp plus its own clock, and each client renders
 * `endsAt - (now + skew)`. That keeps every screen in lockstep and makes a
 * refresh (or a laptop waking from sleep) land on the correct time.
 */

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

/** Rooms untouched for this long are wiped — see RoomIndex. */
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a room may sit empty before the next arrival gets a clean timer.
 * Not zero, because a page refresh empties the room for a moment too, and
 * nobody wants a reload to throw away the focus session they're in.
 */
const EMPTY_GRACE = 60_000;

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
const ITEM_IDS = ["desk", "chair", "shelf", "plant", "window", "clock", "cat", "rug"];
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
  { i: "desk", x: 240, y: 44 },
  { i: "chair", x: 256, y: 80 },
  { i: "chair", x: 64, y: 122 },
  { i: "chair", x: 240, y: 122 },
  { i: "plant", x: 16, y: 146 },
  { i: "plant", x: 278, y: 146 },
  { i: "shelf", x: 0, y: 160 },
  { i: "shelf", x: 288, y: 160 },
  { i: "cat", x: 148, y: 128 },
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
      return new Response("expired");
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    this.roomId = request.headers.get("X-Room-Id") || this.roomId;
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
      id: takeover ? takeover.id : crypto.randomUUID().slice(0, 8),
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
    // reload is invisible to everyone else — no "left", no "joined".
    if (!takeover) this.addLog(`${member.name} joined`);
    this.broadcast();
    server.send(
      JSON.stringify({
        type: "welcome",
        you: member,
        layout: this.state.layout,
        positions: [...(this.positions || new Map())].map(([id, p]) => ({ id, ...p })),
        ...this.snapshot(),
      }),
    );

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
        this.addLog(`${me.name} started the ${this.phaseLabel(s.phase)}`);
        break;
      }

      case "pause": {
        if (!s.running) return;
        s.remaining = Math.max(0, s.endsAt - now);
        s.running = false;
        s.endsAt = null;
        await this.ctx.storage.deleteAlarm();
        this.addLog(`${me.name} paused`);
        break;
      }

      case "reset": {
        s.running = false;
        s.endsAt = null;
        s.remaining = this.phaseDuration(s.phase);
        await this.ctx.storage.deleteAlarm();
        this.addLog(`${me.name} reset the timer`);
        break;
      }

      case "skip": {
        const from = s.phase;
        await this.advance(false);
        this.addLog(`${me.name} skipped the ${this.phaseLabel(from)}`);
        break;
      }

      case "phase": {
        if (!PHASES.includes(msg.phase) || msg.phase === s.phase) return;
        s.phase = msg.phase;
        s.running = false;
        s.endsAt = null;
        s.remaining = this.phaseDuration(s.phase);
        await this.ctx.storage.deleteAlarm();
        this.addLog(`${me.name} switched to ${this.phaseLabel(s.phase)}`);
        break;
      }

      case "name": {
        const next = cleanName(msg.name);
        if (!next || next === me.name) return;
        const was = me.name;
        ws.serializeAttachment({ ...me, name: next });
        this.addLog(`${was} is now ${next}`);
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
          ws.send(JSON.stringify({ type: "notice", text: "The room is full — remove something first" }));
          return;
        }
        s.prevLayout = s.layout.map((o) => ({ ...o }));
        s.layout = [...s.layout, item];
        this.addLog(`${me.name} added a ${item.i}`);
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
        this.addLog(`${me.name} removed a ${gone.i}`);
        await this.save();
        this.broadcastLayout();
        this.broadcast();
        return;
      }

      case "resetLayout": {
        s.prevLayout = s.layout.map((o) => ({ ...o }));
        s.layout = DEFAULT_LAYOUT.map((o) => ({ ...o }));
        this.addLog(`${me.name} put the room back to its original layout`);
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
        this.addLog(`${me.name} undid the last change to the room`);
        await this.save();
        this.broadcastLayout();
        this.broadcast();
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
          this.addLog(`${me.name} set ${changed.map((p) => `${this.phaseLabel(p)} to ${next[p]}m`).join(", ")}`);
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
      this.addLog(`${me.name} left`);
      this.positions?.delete(me.id);
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

    if (idle <= EMPTY_GRACE && !overran) {
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
    this.addLog("Everyone left — timer reset and ready to start");
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
      this.addLog(`${this.phaseLabel(finishedPhase)} finished — ${this.phaseLabel(s.phase)} is up next`);
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

  phaseDuration(phase) {
    return this.state.settings[phase] * 60_000;
  }

  phaseLabel(phase) {
    return phase === "focus" ? "focus" : phase === "short" ? "short break" : "long break";
  }

  addLog(text) {
    this.state.log.unshift({ text, ts: Date.now() });
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
        this.addLog(`${att.name} dropped out`);
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
