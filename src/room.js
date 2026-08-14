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
  autoStart: false,
  sound: true,
};

const MAX_LOG = 12;

/** Rooms untouched for this long are wiped — see RoomIndex. */
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function defaultState() {
  return {
    lastSeen: Date.now(),
    phase: "focus",
    running: false,
    endsAt: null,
    remaining: DEFAULT_SETTINGS.focus * 60_000,
    round: 0,
    completed: 0,
    settings: { ...DEFAULT_SETTINGS },
    log: [],
    guestSeq: 0,
  };
}

const MAX_NAME = 24;

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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.guestSeq += 1;
    // A name chosen before connecting arrives on the URL, so nobody in the
    // room ever sees a flash of "Guest 4" before it resolves.
    const member = {
      id: crypto.randomUUID().slice(0, 8),
      name: cleanName(url.searchParams.get("name")) || `Guest ${this.state.guestSeq}`,
    };
    // Hibernation-safe: the attachment survives the DO being evicted.
    server.serializeAttachment(member);
    this.ctx.acceptWebSocket(server);
    await this.save();

    this.addLog(`${member.name} joined`);
    this.broadcast();
    server.send(JSON.stringify({ type: "welcome", you: member, ...this.snapshot() }));

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
    s.lastSeen = now;
    this.touchIndex();

    switch (msg.type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong", serverTime: now, echo: msg.echo }));
        return;

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
    if (me) this.addLog(`${me.name} left`);
    // The socket is still listed until this handler returns, so exclude it.
    this.broadcast(ws);
    await this.save();
  }

  async webSocketError(ws) {
    this.broadcast(ws);
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

  members(exclude) {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== exclude)
      .map((ws) => ws.deserializeAttachment())
      .filter(Boolean);
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
      if (ws === exclude) continue;
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
