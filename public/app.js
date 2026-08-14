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

/* ---------------- remembered rooms ----------------
   Kept in this browser rather than on the server: a public list of live rooms
   would let anyone enumerate them and reset a group's timer. Mirrors the
   server's 30-day expiry so the list never offers a room that is already gone. */

const STORE_KEY = "pomo.rooms";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const MAX_REMEMBERED = 8;

function loadRooms() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const cutoff = Date.now() - THIRTY_DAYS;
    return raw
      .filter((r) => r && typeof r.id === "string" && typeof r.at === "number" && r.at > cutoff)
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_REMEMBERED);
  } catch {
    return [];
  }
}

function saveRooms(rooms) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(rooms));
  } catch {
    /* private browsing or storage full — the feature is a convenience */
  }
}

function rememberRoom(id) {
  const rooms = loadRooms().filter((r) => r.id !== id);
  rooms.unshift({ id, at: Date.now() });
  saveRooms(rooms.slice(0, MAX_REMEMBERED));
}

function forgetRoom(id) {
  saveRooms(loadRooms().filter((r) => r.id !== id));
  renderRooms();
}

function renderRooms() {
  const rooms = loadRooms();
  const section = $("recent");
  if (!section) return;
  section.hidden = rooms.length === 0;
  $("recentList").innerHTML = rooms
    .map(
      (r) => `<li class="recent__item">
        <a href="/r/${encodeURIComponent(r.id)}" data-room="${esc(r.id)}">${esc(r.id)}</a>
        <span>${ago(r.at)}</span>
        <button class="forget" data-forget="${esc(r.id)}" aria-label="Forget ${esc(r.id)}" title="Remove from this list">&times;</button>
      </li>`,
    )
    .join("");

  for (const a of $("recentList").querySelectorAll("a[data-room]")) {
    a.onclick = (e) => {
      e.preventDefault();
      go(a.dataset.room);
    };
  }
  for (const b of $("recentList").querySelectorAll("[data-forget]")) {
    b.onclick = () => forgetRoom(b.dataset.forget);
  }
}

/* ---------------- Landing ---------------- */

function showLanding() {
  $("landing").hidden = false;
  $("room").hidden = true;
  document.title = "Pomo Together — a shared Pomodoro timer";

  $("create").onclick = () => go(newRoomId());
  $("joinForm").onsubmit = (e) => {
    e.preventDefault();
    const id = normalizeRoomId($("joinCode").value);
    if (!id) return toast("Use letters, numbers and hyphens — at least 3 characters");
    go(id);
  };
  renderRooms();
}

function go(roomId) {
  history.pushState({}, "", `/r/${roomId}`);
  route();
}

/* ---------------- display name ----------------
   Asked once, then remembered across rooms and visits. Staying anonymous is a
   real choice, so the "asked" flag is stored separately from the name itself —
   otherwise an empty name would re-open the gate on every join. */

const NAME_KEY = "pomo.name";
const ASKED_KEY = "pomo.nameAsked";
const MAX_NAME = 24;

function cleanName(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

function storedName() {
  try {
    return cleanName(localStorage.getItem(NAME_KEY));
  } catch {
    return "";
  }
}

function rememberName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    /* private browsing — the name still applies for this session */
  }
}

function alreadyAsked() {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Resolve the name to join with. Returns "" for anonymous.
 * @param {string} roomId shown in the dialog so it's clear where you're joining
 * @param {boolean} force ask even if a name is already known (the rename path)
 */
function askName(roomId, force = false) {
  const known = storedName();
  if (!force && (known || alreadyAsked())) return Promise.resolve(known);

  const gate = $("nameGate");
  $("gateRoom").textContent = roomId;
  $("gateTitle").textContent = force ? "Change your name" : "What should we call you?";
  $("nameInput").value = known;
  gate.hidden = false;
  $("nameInput").focus();
  $("nameInput").select();

  return new Promise((resolve) => {
    const finish = (name) => {
      gate.hidden = true;
      $("nameForm").onsubmit = null;
      $("nameSkip").onclick = null;
      rememberName(name);
      resolve(name);
    };
    $("nameForm").onsubmit = (e) => {
      e.preventDefault();
      finish(cleanName($("nameInput").value));
    };
    $("nameSkip").onclick = () => finish("");
  });
}

/* ---------------- Room ---------------- */

let room = null;

async function showRoom(roomId) {
  $("landing").hidden = true;
  $("room").hidden = false;
  if (room) room.destroy();

  // Show the room behind the gate — dimmed, not yet connected — so it's clear
  // which room you're about to join rather than naming yourself into a void.
  $("roomCodeText").textContent = roomId;
  const name = await askName(roomId);
  // Bail out if the user navigated away while the gate was open.
  if (!location.pathname.endsWith(`/r/${roomId}`)) return;

  room = new Room(roomId, name);
}

class Room {
  constructor(id, name = "") {
    this.id = id;
    this.name = name;
    this.state = null;
    this.me = null;
    this.skew = 0; // serverNow - localNow
    this.ws = null;
    this.retry = 0;
    this.dead = false;
    this.lastChimeAt = 0;
    this.activityPaintedAt = 0;

    $("roomCodeText").textContent = id;
    rememberRoom(id);
    this.bind();
    this.connect();
    this.ticker = setInterval(() => this.paint(), 200);
    this.pinger = setInterval(() => this.ping(), 20_000);
  }

  destroy() {
    this.dead = true;
    clearInterval(this.ticker);
    clearInterval(this.pinger);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
  }

  /* --- transport --- */

  connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    // The name rides along on the handshake so nobody sees a flash of "Guest 4"
    // before it resolves — and it survives a reconnect for free.
    const q = this.name ? `?name=${encodeURIComponent(this.name)}` : "";
    const ws = new WebSocket(`${proto}//${location.host}/api/room/${encodeURIComponent(this.id)}${q}`);
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

    $("rename").onclick = async () => {
      const name = await askName(this.id, true);
      this.name = name; // so a reconnect keeps it
      if (name) this.send({ type: "name", name });
      else toast("Reload the room to go back to being a guest");
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
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
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
let master = null;

function unlockAudio() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (!master) {
      // Notes overlap, so their peaks sum. A limiter lets us drive the chime
      // hard enough to hear across a room without the sum clipping into buzz.
      const limiter = audioCtx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.25;
      master = audioCtx.createGain();
      master.gain.value = 1;
      master.connect(limiter).connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    /* no Web Audio in this browser */
  }
}
addEventListener("pointerdown", unlockAudio);
addEventListener("keydown", unlockAudio);

/* A pure sine is the quietest thing a speaker can make at a given amplitude —
   there is nothing but the fundamental. Each note is a triangle (harmonics
   give it body) plus a softer octave above (presence, so it carries over
   background noise) rather than one louder sine. */
function tone(freq, at, len, gainPeak) {
  for (const [type, mult, share] of [["triangle", 1, 1], ["sine", 2, 0.4]]) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(gainPeak * share, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }
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
  for (const [freq, offset] of notes) tone(freq, t + offset, 0.5, 0.65);
  // A second pass a beat later — a notification you can miss isn't one.
  for (const [freq, offset] of notes) tone(freq, t + 0.9 + offset, 0.5, 0.55);
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
