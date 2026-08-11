/* Pomo Together — client.
   The server owns the clock. We only render `endsAt - now`, corrected for the
   offset between this device's clock and the room's. */

const $ = (id) => document.getElementById(id);

const ADJECTIVES = [
  "quiet", "amber", "brisk", "clever", "dusty", "eager", "fresh", "golden",
  "hidden", "ivory", "jolly", "keen", "lucky", "mellow", "noble", "olive",
  "plucky", "rapid", "silent", "tidy", "urban", "velvet", "warm", "zesty",
];
const NOUNS = [
  "ember", "harbor", "lantern", "meadow", "otter", "pebble", "quill", "ridge",
  "sparrow", "thicket", "willow", "beacon", "cedar", "dune", "falcon", "glade",
  "hollow", "isle", "juniper", "kelp", "marsh", "nectar", "orchid", "trout",
];

function newRoomId() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${10 + Math.floor(Math.random() * 90)}`;
}

function normalizeRoomId(raw) {
  const id = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^.*\/r\//, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return /^[a-z0-9-]{3,48}$/.test(id) ? id : null;
}

const PHASE_NAME = { focus: "Focus", short: "Short break", long: "Long break" };

/* ---------------- Landing ---------------- */

function showLanding() {
  $("landing").hidden = false;
  $("room").hidden = true;
  document.title = "Pomo Together — a shared Pomodoro timer";

  $("create").onclick = () => go(newRoomId());
  $("joinForm").onsubmit = (e) => {
    e.preventDefault();
    const id = normalizeRoomId($("joinCode").value);
    if (!id) return toast("That doesn't look like a room code");
    go(id);
  };
}

function go(roomId) {
  history.pushState({}, "", `/r/${roomId}`);
  route();
}

/* ---------------- Room ---------------- */

let room = null;

function showRoom(roomId) {
  $("landing").hidden = true;
  $("room").hidden = false;
  if (room) room.destroy();
  room = new Room(roomId);
}

class Room {
  constructor(id) {
    this.id = id;
    this.state = null;
    this.me = null;
    this.skew = 0; // serverNow - localNow
    this.ws = null;
    this.retry = 0;
    this.dead = false;
    this.lastChimeAt = 0;
    this.activityPaintedAt = 0;

    $("roomCodeText").textContent = id;
    this.bind();
    this.connect();
    this.ticker = setInterval(() => this.paint(), 200);
    this.pinger = setInterval(() => this.ping(), 20_000);
  }

  destroy() {
    this.dead = true;
    clearInterval(this.ticker);
    clearInterval(this.pinger);
    document.onkeydown = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
  }

  /* --- transport --- */

  connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/room/${encodeURIComponent(this.id)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.setPresence("live");
      this.ping();
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "pong") {
        // Halve the round trip so the offset isn't biased by latency.
        const rtt = Date.now() - msg.echo;
        this.skew = msg.serverTime + rtt / 2 - Date.now();
        return;
      }
      if (msg.type === "welcome") {
        this.me = msg.you;
        if (!this.greeted) {
          this.greeted = true;
          if (msg.members.length === 1) toast("You're first in — copy the invite link to bring your group");
        }
      }
      if (msg.type === "welcome" || msg.type === "state") {
        if (!this.skew) this.skew = msg.serverTime - Date.now();
        this.apply(msg);
      }
    };

    ws.onclose = () => {
      if (this.dead) return;
      this.setPresence("down");
      const wait = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.dead && this.connect(), wait);
    };

    ws.onerror = () => ws.close();
  }

  send(payload) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
    else toast("Reconnecting…");
  }

  ping() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "ping", echo: Date.now() }));
    }
  }

  now() {
    return Date.now() + this.skew;
  }

  /* --- state --- */

  apply(msg) {
    const prev = this.state;
    this.state = msg;

    // Every section end — work or rest — announces itself.
    if (msg.chime && Date.now() - this.lastChimeAt > 1500) {
      this.lastChimeAt = Date.now();
      const finishedFocus = msg.chime === "focus";
      if (msg.settings.sound) sectionEnded(finishedFocus);
      toast(finishedFocus ? "Focus finished — time for a break" : "Break over — back to focus");
    }

    if (!prev || prev.phase !== msg.phase) document.body.dataset.phase = msg.phase;
    if (!this.settingsDirty) this.fillSettings(msg.settings);

    this.paintStatic();
    this.paint();
  }

  remainingMs() {
    const s = this.state;
    if (!s) return 0;
    return Math.max(0, s.running ? s.endsAt - this.now() : s.remaining);
  }

  paintStatic() {
    const s = this.state;
    if (!s) return;

    for (const btn of document.querySelectorAll(".phase")) {
      btn.setAttribute("aria-selected", String(btn.dataset.phase === s.phase));
    }

    $("primary").textContent = s.running ? "Pause" : "Start";
    document.body.classList.toggle("paused", !s.running);

    const n = s.members.length;
    $("presenceText").textContent = n === 1 ? "just you" : `${n} people`;

    $("members").innerHTML = s.members
      .map((m) => {
        const mine = this.me && m.id === this.me.id;
        return `<div class="who${mine ? " who--me" : ""}"><i></i>${esc(m.name)}${mine ? " <span>you</span>" : ""}</div>`;
      })
      .join("");

    this.paintActivity();
  }

  paintActivity() {
    const log = this.state?.log || [];
    this.activityPaintedAt = Date.now();
    $("activity").innerHTML = log.length
      ? log.map((e) => `<li>${esc(e.text)}<time>${ago(e.ts)}</time></li>`).join("")
      : `<li class="empty">Nothing yet — start the timer.</li>`;
  }

  paint() {
    const s = this.state;
    if (!s) return;

    const ms = this.remainingMs();
    const label = fmt(ms);
    $("time").textContent = label;

    const total = s.settings[s.phase] * 60_000;
    $("progress").style.width = `${Math.min(100, Math.max(0, (1 - ms / total) * 100))}%`;

    const roundInCycle = (s.round % s.settings.roundsBeforeLong) + (s.phase === "focus" ? 1 : 0);
    const shown = Math.min(s.settings.roundsBeforeLong, Math.max(1, roundInCycle));
    $("meta").textContent =
      `${PHASE_NAME[s.phase]} · round ${shown} of ${s.settings.roundsBeforeLong}` +
      (s.completed ? ` · ${s.completed} focus session${s.completed === 1 ? "" : "s"} done` : "");

    document.title = `${label} · ${PHASE_NAME[s.phase]}${s.running ? "" : " (paused)"}`;

    // Keep the "2m ago" stamps honest without redrawing on every frame.
    if (Date.now() - this.activityPaintedAt > 15_000) this.paintActivity();
  }

  setPresence(kind) {
    const dot = $("presenceDot");
    dot.classList.toggle("live", kind === "live");
    dot.classList.toggle("down", kind === "down");
    $("connStatus").textContent = kind === "live" ? "in sync" : "reconnecting…";
  }

  /* --- input --- */

  bind() {
    $("primary").onclick = () => this.send({ type: this.state?.running ? "pause" : "start" });
    $("skip").onclick = () => this.send({ type: "skip" });
    $("reset").onclick = () => this.send({ type: "reset" });

    for (const btn of document.querySelectorAll(".phase")) {
      btn.onclick = () => this.send({ type: "phase", phase: btn.dataset.phase });
    }

    $("roomCode").onclick = async () => {
      const link = `${location.origin}/r/${this.id}`;
      try {
        await navigator.clipboard.writeText(link);
        toast("Invite link copied — send it to your group");
      } catch {
        prompt("Copy this link:", link);
      }
    };

    for (const id of ["setFocus", "setShort", "setLong", "setRounds", "setAuto", "setSound"]) {
      const el = $(id);
      el.oninput = () => {
        this.settingsDirty = true;
      };
      el.onchange = () => this.pushSettings();
      el.onblur = () => {
        this.settingsDirty = false;
        if (this.state) this.fillSettings(this.state.settings);
      };
    }

    for (const chip of document.querySelectorAll("[data-preset]")) {
      chip.onclick = () => {
        const [f, s, l, r] = chip.dataset.preset.split(",").map(Number);
        $("setFocus").value = f;
        $("setShort").value = s;
        $("setLong").value = l;
        $("setRounds").value = r;
        this.pushSettings();
      };
    }

    document.onkeydown = (e) => {
      if (e.target.matches("input, textarea")) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        $("primary").click();
      }
    };
  }

  fillSettings(s) {
    $("setFocus").value = s.focus;
    $("setShort").value = s.short;
    $("setLong").value = s.long;
    $("setRounds").value = s.roundsBeforeLong;
    $("setAuto").checked = s.autoStart;
    $("setSound").checked = s.sound;
  }

  pushSettings() {
    this.settingsDirty = false;
    this.send({
      type: "settings",
      settings: {
        focus: +$("setFocus").value,
        short: +$("setShort").value,
        long: +$("setLong").value,
        roundsBeforeLong: +$("setRounds").value,
        autoStart: $("setAuto").checked,
        sound: $("setSound").checked,
      },
    });
  }
}

/* ---------------- helpers ---------------- */

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function ago(ts) {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

/* ---------------- notification sound ----------------
   Every section end — focus or break — plays a chime. It's synthesised, so
   there's no audio file to load or fail. Browsers refuse to start audio until
   the page has been interacted with, so the context is created and unlocked on
   the first click or keypress rather than at the moment the phase ends. */

let audioCtx = null;

function unlockAudio() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    /* no Web Audio in this browser */
  }
}
addEventListener("pointerdown", unlockAudio);
addEventListener("keydown", unlockAudio);

function tone(freq, at, len, gainPeak) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq; // one steady pitch per note
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(gainPeak, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(at);
  osc.stop(at + len + 0.05);
}

/**
 * @param {boolean} finishedFocus true when work just ended (rest is next),
 *   false when rest ended and it's back to work. The two get different
 *   patterns so you can tell them apart without looking at the screen.
 */
function sectionEnded(finishedFocus) {
  unlockAudio();
  if (!audioCtx || audioCtx.state !== "running") {
    // Autoplay still blocked — the phase colour and toast carry the message.
    return;
  }
  const t = audioCtx.currentTime + 0.02;
  const notes = finishedFocus
    ? [ [587.33, 0.0], [880.0, 0.16], [1174.66, 0.32] ]   // work done: rising, "go rest"
    : [ [880.0, 0.0], [659.25, 0.18], [523.25, 0.36] ];    // rest done: falling, "back to it"
  for (const [freq, offset] of notes) tone(freq, t + offset, 0.42, 0.2);
}

/* ---------------- routing ---------------- */

function route() {
  const m = location.pathname.match(/^\/r\/([^/]+)\/?$/);
  const id = m ? normalizeRoomId(m[1]) : null;
  if (id) showRoom(id);
  else {
    if (room) room.destroy();
    room = null;
    document.body.dataset.phase = "focus";
    showLanding();
  }
}

addEventListener("popstate", route);
route();
