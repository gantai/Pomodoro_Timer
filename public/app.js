/* Pomo Together — client.
   The server owns the clock. We only render `endsAt - now`, corrected for the
   offset between this device's clock and the room's. */

import { PixelRoom, FLOOR_TOP } from "./pixel/scene.js";
import { ICONS, ICON_IDS, iconDataURL, ITEM_IDS, itemSize, paintItem, ERASER, blit, spriteSize } from "./pixel/art.js";
import { WALL_W, WALL_H, WALL_PENS, PEN_COUNT, blankWall, decodeWall } from "./pixel/wall.js";
import { LANGS, t, ago, logLine, lang, setLang, initLang } from "./i18n.js";

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

const MAX_NOTES = 200;

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

/* ---------------- language ----------------
   A per-person choice, not a room one: two people in the same room may not
   read the same language, and a shared setting would mean one of them loses.
   Changing it repaints in place — no reload, nothing lost. */

function applyI18n(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    const params = {};
    for (const { name, value } of el.attributes) {
      if (name.startsWith("data-i18n-p-")) params[name.slice(12)] = value;
    }
    el.textContent = t(el.dataset.i18n, params);
  }
  // Only for strings whose translation legitimately carries markup (a <kbd>,
  // a <code>, a bolded room name). Every one of them is ours, from i18n.js.
  for (const el of root.querySelectorAll("[data-i18n-html]")) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
  for (const el of root.querySelectorAll("[data-i18n-ph]")) {
    el.placeholder = t(el.dataset.i18nPh);
  }
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle);
  }
  document.title = room ? document.title : t("app.tagline");
}

function buildLangPickers() {
  for (const host of [$("langLanding"), $("langRoom")]) {
    if (!host) continue;
    host.innerHTML = LANGS.map(
      (l) =>
        `<button type="button" role="radio" data-lang="${l.id}" aria-checked="${l.id === lang()}" title="${l.name}">${l.label}</button>`,
    ).join("");
    for (const b of host.children) {
      b.onclick = () => chooseLang(b.dataset.lang);
    }
  }
}

function markLang() {
  for (const host of [$("langLanding"), $("langRoom")]) {
    for (const b of host?.children || []) b.setAttribute("aria-checked", String(b.dataset.lang === lang()));
  }
}

function chooseLang(id) {
  if (id === lang()) return;
  setLang(id);
  markLang();
  applyI18n();
  thumbs.clear();
  renderRooms();
  room?.relabel();
}

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
        <button class="forget" data-forget="${esc(r.id)}" aria-label="${esc(t("land.forget"))}" title="${esc(t("land.forget"))}">&times;</button>
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
  document.title = t("app.tagline");

  $("create").onclick = () => go(newRoomId());
  $("joinForm").onsubmit = (e) => {
    e.preventDefault();
    const id = normalizeRoomId($("joinCode").value);
    if (!id) return toast(t("land.badCode"));
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

/* This browser's own handle, so the server recognises a reconnect instead of
   treating it as a second person arriving. Stored per browser rather than per
   tab on purpose: one person should be one character in the room, so opening
   the room in a second window takes over the first rather than standing next
   to it. Two different browsers, or two devices, are still two people. */
const CID_KEY = "pomo.cid";

function clientId() {
  try {
    let v = localStorage.getItem(CID_KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(CID_KEY, v);
    }
    return v;
  } catch {
    // No storage: fall back to a per-load id. Reconnects within this page
    // still take over correctly; a reload starts fresh.
    return (clientId.fallback ||= crypto.randomUUID());
  }
}

const NAME_KEY = "pomo.name";
const ASKED_KEY = "pomo.nameAsked";
const ICON_KEY = "pomo.icon";
const MAX_NAME = 24;

const readPref = (key, fallback = null) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private browsing — the choice just won't survive a reload */
  }
};

function storedIcon() {
  const v = readPref(ICON_KEY);
  return ICON_IDS.includes(v) ? v : "person";
}

function cleanName(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

const storedName = () => cleanName(readPref(NAME_KEY, ""));
const alreadyAsked = () => readPref(ASKED_KEY) === "1";

function rememberName(name) {
  writePref(NAME_KEY, name);
  writePref(ASKED_KEY, "1");
}

/* Some people want the room; some want a clock and nothing else. Remembered
   per browser, like the name. */
const ROOM_PREF_KEY = "pomo.hideRoom";
const WALL_PREF_KEY = "pomo.hideWall";

/**
 * Resolve the name and icon to join with. Resolves to {name, icon}; an empty
 * name means anonymous.
 * @param {string} roomId shown in the dialog so it's clear where you're joining
 * @param {boolean} force ask even if a name is already known (the rename path)
 */
function askIdentity(roomId, force = false) {
  const known = storedName();
  let icon = storedIcon();
  if (!force && (known || alreadyAsked())) return Promise.resolve({ name: known, icon });

  const gate = $("nameGate");
  $("gateNote").innerHTML = t("gate.note", { room: esc(roomId) });
  $("gateTitle").textContent = force ? t("gate.change") : t("gate.who");
  $("nameInput").value = known;

  // Build the picker once; repaint the selection and the labels each time.
  const picker = $("iconPicker");
  if (!picker.childElementCount) {
    picker.innerHTML = ICONS.map(
      (i) =>
        `<button type="button" class="icon" role="radio" data-icon="${i.id}" aria-checked="false">
           <img src="${iconDataURL(i.id)}" alt="" /><span></span>
         </button>`,
    ).join("");
  }
  const mark = () => {
    for (const b of picker.children) {
      b.setAttribute("aria-checked", String(b.dataset.icon === icon));
      b.title = t(`icon.${b.dataset.icon}`);
      b.querySelector("span").textContent = t(`icon.${b.dataset.icon}`);
    }
  };
  for (const b of picker.children) {
    b.onclick = () => {
      icon = b.dataset.icon;
      mark();
    };
  }
  mark();

  gate.hidden = false;
  $("nameInput").focus();
  $("nameInput").select();

  return new Promise((resolve) => {
    const finish = (name) => {
      gate.hidden = true;
      $("nameForm").onsubmit = null;
      $("nameSkip").onclick = null;
      rememberName(name);
      writePref(ICON_KEY, icon);
      resolve({ name, icon });
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
  const { name, icon } = await askIdentity(roomId);
  // Bail out if the user navigated away while the gate was open.
  if (!location.pathname.endsWith(`/r/${roomId}`)) return;

  room = new Room(roomId, name, icon);
}

class Room {
  constructor(id, name = "", icon = "person") {
    this.id = id;
    this.name = name;
    this.icon = icon;
    this.state = null;
    this.me = null;
    this.skew = 0; // serverNow - localNow
    this.ws = null;
    this.retry = 0;
    this.dead = false;
    this.lastChimeAt = 0;
    this.activityPaintedAt = 0;
    this.notes = [];
    this.wallCells = blankWall();
    this.pen = 1;
    this.nib = 1;
    this.pending = [];

    $("roomCodeText").textContent = id;
    rememberRoom(id);
    this.setupScene();
    this.setupWall();
    this.bind();
    this.connect();
    this.ticker = setInterval(() => this.paint(), 200);
    this.pinger = setInterval(() => this.ping(), 20_000);
  }

  destroy() {
    this.dead = true;
    clearInterval(this.ticker);
    clearInterval(this.pinger);
    clearInterval(this.tagTimer);
    clearInterval(this.flusher);
    removeEventListener("resize", this._wallResize);
    this.scene?.destroy();
    this.scene = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
  }

  /** Repaint everything that was rendered in the old language. */
  relabel() {
    this.buildPalette(true);
    this.renderNotes();
    this.paintStatic();
    this.paint();
    this.applyRoomVisibility();
    this.setDecorating(!!this.decorating);
  }

  /* --- the pixel room --- */

  setupScene() {
    this.roomHidden = readPref(ROOM_PREF_KEY) === "1";
    this.wallHidden = readPref(WALL_PREF_KEY) === "1";
    this.scene = new PixelRoom($("pixelRoom"), {
      onMove: (pos) => {
        this.send({ type: "move", ...pos });
        this.rememberPos(pos);
      },
      onPlace: (i, x, y) => this.send({ type: "place", i, x, y }),
      onRemove: (index) => this.send({ type: "removeItem", index }),
    });
    this.buildPalette();
    this.applyRoomVisibility();
    this.tagTimer = setInterval(() => this.paintTags(), 80);
  }

  /** The furniture tray, drawn from the same sprites the room uses. */
  buildPalette(rebuild = false) {
    const host = $("palette");
    if (host.childElementCount && !rebuild) return;
    const chosen = rebuild ? this.currentTool() : "desk";
    host.innerHTML =
      ITEM_IDS.map(
        (id) =>
          `<button type="button" class="tool" role="radio" data-tool="${id}" aria-checked="${id === chosen}" title="${esc(t(`item.${id}`))}">
             <img src="${itemThumb(id)}" alt="" /><span>${esc(t(`item.${id}`))}</span>
           </button>`,
      ).join("") +
      `<button type="button" class="tool tool--erase" role="radio" data-tool="erase" aria-checked="${chosen === "erase"}" title="${esc(t("dec.removeTitle"))}">
         <img src="${rubberIcon()}" alt="" /><span>${esc(t("dec.remove"))}</span>
       </button>`;

    for (const b of host.children) {
      b.onclick = () => {
        for (const o of host.children) o.setAttribute("aria-checked", String(o === b));
        this.scene?.setEditing(true, b.dataset.tool);
      };
    }
  }

  setDecorating(on) {
    this.decorating = on;
    $("decorate").hidden = !on;
    $("moveHint").hidden = on;
    $("decorateBtn").setAttribute("aria-pressed", String(on));
    this.scene?.setEditing(on, on ? this.currentTool() : null);
  }

  currentTool() {
    const picked = $("palette").querySelector('[aria-checked="true"]');
    return picked?.dataset.tool || "desk";
  }

  applyRoomVisibility() {
    const hidden = this.roomHidden;
    $("scene").hidden = hidden;
    $("wallStrip").hidden = hidden || this.wallHidden;
    $("plainClock").hidden = !hidden;
    $("toggleRoom").setAttribute("aria-pressed", String(hidden));
    $("toggleRoomLabel").textContent = hidden ? t("rail.showRoom") : t("rail.hideRoom");
    $("wallBtn").setAttribute("aria-pressed", String(!this.wallHidden && !hidden));
    if (hidden) {
      this.scene?.destroy();
    } else {
      this.scene?.setExtraHeight(this.wallHidden ? 0 : WALL_H);
      this.scene?.start();
      this.sizeWall();
    }
  }

  paintTags() {
    if (this.roomHidden || !this.scene) return;
    const tags = this.scene.labelPositions();
    const host = $("tags");
    if (host.childElementCount !== tags.length) {
      host.innerHTML = tags.map(() => '<span class="tag"></span>').join("");
    }
    const nodes = host.children;
    tags.forEach((t2, i) => {
      const el = nodes[i];
      if (el.textContent !== t2.name) el.textContent = t2.name;
      el.className = `tag${t2.me ? " tag--me" : ""}`;
      el.style.left = `${t2.left}px`;
      el.style.top = `${t2.top}px`;
    });
  }

  /* --- where you were standing ---
     Kept in this browser, per room. The server holds positions in memory
     only, and a restart — every deploy is one — empties it; a reload empties
     the page. This is the one place that remembers across both. */

  posKey() {
    return `pomo.pos.${this.id}`;
  }

  rememberPos(pos) {
    const now = Date.now();
    // Walking is ten updates a second, so throttle — but always keep the one
    // where you stop, or a reload puts you half a second short of where you
    // actually stood.
    if (pos.moving && now - (this.posSavedAt || 0) < 500) return;
    this.posSavedAt = now;
    writePref(this.posKey(), JSON.stringify({ x: pos.x, y: pos.y, d: pos.d }));
  }

  restorePos() {
    try {
      const saved = JSON.parse(readPref(this.posKey(), "null"));
      if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return;
      this.scene?.placeMe(saved.x, saved.y, saved.d);
      const mine = this.scene?.myPosition();
      if (mine) this.send({ type: "move", ...mine });
    } catch {
      /* nothing saved, or not ours */
    }
  }

  /* --- 涂鸦墙 · the doodle wall --- */

  setupWall() {
    const c = $("wallCanvas");
    this.wallCtx = c.getContext("2d");
    this.wallCtx.imageSmoothingEnabled = false;

    $("pens").innerHTML =
      WALL_PENS.slice(1)
        .map(
          (colour, i) =>
            `<button type="button" class="pen" role="radio" data-pen="${i + 1}" aria-checked="${i === 0}" style="background:${colour}" aria-label="${esc(t("wall.pen"))} ${i + 1}"></button>`,
        )
        .join("") +
      `<button type="button" class="pen pen--erase" role="radio" data-pen="0" aria-checked="false" title="${esc(t("wall.eraser"))}">
         <img src="${rubberIcon()}" alt="${esc(t("wall.eraser"))}" />
       </button>
       <span class="gap"></span>` +
      [1, 2, 4]
        .map(
          (n, i) =>
            `<button type="button" class="nib" role="radio" data-nib="${n}" aria-checked="${i === 0}" title="${esc(t("wall.nib"))} ${n}">
               <i style="width:${3 + i * 4}px;height:${3 + i * 4}px"></i></button>`,
        )
        .join("");

    for (const b of $("pens").querySelectorAll("[data-pen]")) {
      b.onclick = () => {
        this.pen = Number(b.dataset.pen);
        for (const o of $("pens").querySelectorAll("[data-pen]")) {
          o.setAttribute("aria-checked", String(o === b));
        }
        this._hideCursor();
      };
    }
    for (const b of $("pens").querySelectorAll("[data-nib]")) {
      b.onclick = () => {
        this.nib = Number(b.dataset.nib);
        for (const o of $("pens").querySelectorAll("[data-nib]")) {
          o.setAttribute("aria-checked", String(o === b));
        }
        this._hideCursor();
      };
    }

    // Draw locally at once and send in batches: a drag is dozens of events a
    // second and each one must not be a message.
    const at = (e) => {
      const r = c.getBoundingClientRect();
      const s = r.width / WALL_W;
      return { x: Math.floor((e.clientX - r.left) / s), y: Math.floor((e.clientY - r.top) / s) };
    };
    // You cannot aim an eraser whose edges you cannot see, and at nib 4 the
    // difference between hitting a line and taking out the one beside it is
    // three pixels. The box is the exact area the nib covers.
    const cursor = $("wallCursor");
    const showCursor = (p) => {
      const scale = this.scene?.scale || 3;
      const half = Math.floor(this.nib / 2);
      cursor.hidden = false;
      cursor.classList.toggle("wallcursor--erase", this.pen === 0);
      cursor.style.width = `${this.nib * scale}px`;
      cursor.style.height = `${this.nib * scale}px`;
      cursor.style.left = `${(p.x - half) * scale}px`;
      cursor.style.top = `${(p.y - half) * scale}px`;
    };
    this._hideCursor = () => (cursor.hidden = true);
    c.onpointerenter = (e) => showCursor(at(e));
    c.onpointerleave = () => this._hideCursor();
    c.onpointerdown = (e) => {
      c.setPointerCapture(e.pointerId);
      this.drawing = at(e);
      this.stroke(this.drawing, this.drawing);
    };
    c.onpointermove = (e) => {
      const p = at(e);
      showCursor(p);
      if (!this.drawing) return;
      this.stroke(this.drawing, p);
      this.drawing = p;
    };
    const stop = () => (this.drawing = null);
    c.onpointerup = stop;
    c.onpointercancel = stop;

    this.flusher = setInterval(() => this.flushPaint(), 70);
    this._wallResize = () => this.sizeWall();
    addEventListener("resize", this._wallResize);
    this.sizeWall();
  }

  /** The wall takes the room's scale exactly, so their pixels match. */
  sizeWall() {
    const scale = this.scene?.scale || 3;
    // The HUD is sized from this too. It used to scale off the viewport,
    // which on a wide window with a small room made the clock bigger than
    // the room it was sitting on.
    $("sceneFrame").style.setProperty("--rs", scale);
    $("sceneFrame").style.setProperty("--band", `${FLOOR_TOP * scale}px`);
    const c = $("wallCanvas");
    c.style.width = `${WALL_W * scale}px`;
    c.style.height = `${WALL_H * scale}px`;
    $("wallStrip").style.width = `${WALL_W * scale}px`;
  }

  /** Bresenham between two pointer samples, so a fast drag is a line. */
  stroke(a, b) {
    let { x, y } = a;
    const dx = Math.abs(b.x - x);
    const dy = -Math.abs(b.y - y);
    const sx = x < b.x ? 1 : -1;
    const sy = y < b.y ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.dab(x, y);
      if (x === b.x && y === b.y) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  dab(cx, cy) {
    const half = Math.floor(this.nib / 2);
    for (let y = cy - half; y < cy - half + this.nib; y++) {
      for (let x = cx - half; x < cx - half + this.nib; x++) {
        if (x < 0 || y < 0 || x >= WALL_W || y >= WALL_H) continue;
        if (this.wallCells[y * WALL_W + x] === this.pen) continue;
        this.wallCells[y * WALL_W + x] = this.pen;
        this.paintCell(x, y, this.pen);
        this.pending.push([x, y, this.pen]);
      }
    }
  }

  flushPaint() {
    if (!this.pending.length) return;
    const cells = this.pending.splice(0, 600);
    this.send({ type: "paint", cells });
  }

  paintCell(x, y, c) {
    if (c === 0) this.wallCtx.clearRect(x, y, 1, 1);
    else {
      this.wallCtx.fillStyle = WALL_PENS[c];
      this.wallCtx.fillRect(x, y, 1, 1);
    }
  }

  repaintWall() {
    this.wallCtx.clearRect(0, 0, WALL_W, WALL_H);
    for (let y = 0; y < WALL_H; y++) {
      for (let x = 0; x < WALL_W; x++) {
        const c = this.wallCells[y * WALL_W + x];
        if (c) this.paintCell(x, y, c);
      }
    }
  }

  /* --- 留言板 · the message board --- */

  seenKey() {
    return `pomo.seen.${this.id}`;
  }

  /**
   * Updates the badge in place rather than re-rendering. Re-rendering here
   * replaced the list while a click on a note's × was still in flight — the
   * button was focused, this ran, and the element the click was headed for no
   * longer existed, so taking a note down silently did nothing.
   */
  markBoardSeen() {
    const newest = this.notes.reduce((m, n) => Math.max(m, n.at), 0);
    if (newest <= (Number(readPref(this.seenKey(), "0")) || 0)) return;
    writePref(this.seenKey(), String(newest));
    $("boardNew").hidden = true;
  }

  renderNotes() {
    const list = $("boardList");
    const seen = Number(readPref(this.seenKey(), "0")) || 0;
    // Hold the bottom if that is where we were, so a note arriving while you
    // read older ones does not yank the list out from under you.
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;

    if (!this.notes.length) {
      list.innerHTML = `<li class="board__empty">${esc(t("board.empty"))}</li>`;
    } else {
      // Oldest first: the newest note ends up against the box you type in,
      // which is the only arrangement that matches where the compose box is.
      list.innerHTML = this.notes
        .map(
          (n) => `<li class="note${n.by === this.me?.id ? " note--mine" : ""}" data-note="${esc(n.id)}">
            <img src="${iconDataURL(n.icon || "person", n.by, 2)}" alt="" />
            <div>
              <div class="note__who"><b>${esc(n.name)}</b><time>${esc(ago(n.at))}</time></div>
              <div class="note__text">${esc(n.text)}</div>
            </div>
            <button class="note__x" data-unnote="${esc(n.id)}" title="${esc(t("board.removeTitle"))}" aria-label="${esc(t("board.removeTitle"))}">&times;</button>
          </li>`,
        )
        .join("");
      for (const b of list.querySelectorAll("[data-unnote]")) {
        b.onclick = () => this.send({ type: "unnote", id: b.dataset.unnote });
      }
    }
    if (atBottom || this.boardFirstPaint !== false) list.scrollTop = list.scrollHeight;
    this.boardFirstPaint = false;
    this.markBoardEdges();

    const fresh = this.notes.filter((n) => n.at > seen && n.by !== this.me?.id).length;
    const pill = $("boardNew");
    pill.hidden = fresh === 0;
    pill.textContent = t("board.new", { n: fresh });
    $("boardCount").textContent = t("board.count", { n: this.notes.length, max: MAX_NOTES });
  }

  /** Which edges of the board have notes hidden past them. */
  markBoardEdges() {
    const l = $("boardList");
    l.classList.toggle("has-above", l.scrollTop > 4);
    l.classList.toggle("has-below", l.scrollHeight - l.scrollTop - l.clientHeight > 4);
  }

  postNote() {
    const el = $("noteInput");
    const text = el.value.trim();
    if (!text) return;
    this.send({ type: "note", text });
    el.value = "";
  }

  /* --- deleting --- */

  openDelete() {
    $("delBody").innerHTML = t("del.body", { room: esc(this.id) });
    $("delConfirmLabel").innerHTML = t("del.confirm", { room: esc(this.id) });
    $("delInput").value = "";
    $("delInput").placeholder = this.id;
    $("deleteGate").hidden = false;
    $("delInput").focus();
  }

  /**
   * This window has been replaced by another one holding the same identity.
   * Give up the room quietly — reconnecting would take it straight back and
   * the two windows would fight over it forever.
   */
  standDown() {
    if (this.dead) return;
    this.dead = true;
    clearInterval(this.ticker);
    clearInterval(this.pinger);
    clearInterval(this.tagTimer);
    clearInterval(this.flusher);
    this.scene?.destroy();
    if (this.ws) {
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        /* already closing */
      }
    }
    $("presenceDot").classList.remove("live", "down");
    $("connStatus").textContent = t("conn.elsewhere");
    toast(t("toast.replaced"));
  }

  /* --- transport --- */

  connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    // The name rides along on the handshake so nobody sees a flash of "Guest 4"
    // before it resolves — and it survives a reconnect for free.
    const q = new URLSearchParams();
    if (this.name) q.set("name", this.name);
    if (this.icon && this.icon !== "person") q.set("icon", this.icon);
    q.set("cid", clientId());
    const qs = q.toString() ? `?${q}` : "";
    const ws = new WebSocket(`${proto}//${location.host}/api/room/${encodeURIComponent(this.id)}${qs}`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.setPresence("live");
      this.ping();
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case "pong": {
          // Halve the round trip so the offset isn't biased by latency.
          const rtt = Date.now() - msg.echo;
          this.skew = msg.serverTime + rtt / 2 - Date.now();
          return;
        }
        case "pos":
          this.scene?.setPosition(msg.id, msg.x, msg.y, msg.d, msg.moving);
          return;
        case "replaced":
          this.standDown();
          return;
        case "layout":
          this.scene?.setLayout(msg.layout);
          return;
        case "notice":
          toast(msg.key ? t(msg.key) : msg.text);
          return;
        case "note":
          this.notes.push(msg.note);
          if (msg.dropped) this.notes = this.notes.filter((n) => n.id !== msg.dropped);
          this.renderNotes();
          return;
        case "unnote":
          this.notes = this.notes.filter((n) => n.id !== msg.id);
          this.renderNotes();
          return;
        case "painted":
          for (const [x, y, c] of msg.cells) {
            this.wallCells[y * WALL_W + x] = c;
            this.paintCell(x, y, c);
          }
          return;
        case "wall":
          this.wallCells = decodeWall(msg.wall) || blankWall();
          this.repaintWall();
          $("undoWall").hidden = false;
          return;
        case "deleted":
          this.roomDeleted(msg.by);
          return;
        case "roll": {
          // Somebody arrived and the server has nothing to tell them about
          // where we all are. Everyone answers, spread over a moment so a
          // full room does not answer in one burst.
          const mine = this.scene?.myPosition();
          if (mine) setTimeout(() => this.send({ type: "move", ...mine }), 80 + Math.random() * 300);
          return;
        }
      }

      if (msg.type === "welcome") {
        this.me = msg.you;
        this.scene?.setMe(msg.you.id);
        this.knownIds = new Set();
        this.notes = Array.isArray(msg.notes) ? msg.notes : [];
        this.wallCells = decodeWall(msg.wall) || blankWall();
        this.repaintWall();
        this.renderNotes();
        if (!this.greeted) {
          this.greeted = true;
          if (msg.members.length === 1) toast(t("toast.first"));
        }
      }
      if (msg.type === "welcome" || msg.type === "state") {
        if (!this.skew) this.skew = msg.serverTime - Date.now();
        this.apply(msg);
        if (msg.layout) this.scene?.setLayout(msg.layout);
        if (msg.positions) {
          for (const p of msg.positions) this.scene?.setPosition(p.id, p.x, p.y, p.d, false);
        }
        // After the room is built: back to where this browser last stood.
        if (msg.type === "welcome") this.restorePos();
      }
    };

    ws.onclose = (ev) => {
      if (this.dead) return;
      // 4000: this room was opened somewhere else and took our place. If we
      // reconnected we would take it straight back, and the two would fight
      // over the room forever. 4002: the room no longer exists.
      if (ev?.code === 4000) return this.standDown();
      if (ev?.code === 4002) return;
      this.setPresence("down");
      const wait = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.dead && this.connect(), wait);
    };

    ws.onerror = () => ws.close();
  }

  /** The room is gone, for everyone. Stop, forget it, and go back out. */
  roomDeleted(by) {
    const mine = by === this.me?.name;
    this.destroy();
    forgetRoom(this.id);
    room = null;
    toast(mine ? t("del.done") : t("del.byOther", { name: by }));
    history.pushState({}, "", "/");
    document.body.dataset.phase = "focus";
    showLanding();
  }

  send(payload) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
    else toast(t("toast.reconnecting"));
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
      toast(finishedFocus ? t("toast.focusDone") : t("toast.breakDone"));
    }

    if (!prev || prev.phase !== msg.phase) document.body.dataset.phase = msg.phase;
    if (!this.settingsDirty) this.fillSettings(msg.settings);

    if (this.scene) {
      this.scene.syncMembers(msg.members);
      this.scene.setPhase(msg.phase, msg.running);
      // Somebody new arrived: tell them where we are. The server keeps
      // positions in memory only, so this is also how a room that hibernated
      // and forgot everyone fills itself back in.
      const ids = new Set(msg.members.map((m) => m.id));
      if (this.knownIds) {
        for (const id of ids) {
          if (!this.knownIds.has(id) && id !== this.me?.id) {
            // Read the position when the message goes, not now: on a reload
            // this runs before the saved position is restored, and sending
            // the starting seat a moment after the real spot walked everyone
            // else's copy of you straight back to it.
            setTimeout(() => {
              const mine = this.scene?.myPosition();
              if (mine) this.send({ type: "move", ...mine });
            }, 150 + Math.random() * 250);
            break;
          }
        }
      }
      this.knownIds = ids;
    }

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

    $("primary").textContent = s.running ? t("ctl.pause") : t("ctl.start");
    document.body.classList.toggle("paused", !s.running);

    const n = s.members.length;
    $("presenceText").textContent = n === 1 ? t("rail.justYou") : t("rail.people", { n });

    $("members").innerHTML = s.members
      .map((m) => {
        const mine = this.me && m.id === this.me.id;
        return `<div class="who${mine ? " who--me" : ""}"><img src="${iconDataURL(m.icon || "person", m.id, 2)}" alt="" />${esc(m.name)}${mine ? ` <span>${esc(t("rail.you"))}</span>` : ""}</div>`;
      })
      .join("");

    this.paintActivity();
  }

  paintActivity() {
    const log = this.state?.log || [];
    this.activityPaintedAt = Date.now();
    $("activity").innerHTML = log.length
      ? log.map((e) => `<li>${esc(logLine(e))}<time>${esc(ago(e.ts))}</time></li>`).join("")
      : `<li class="empty">${esc(t("act.empty"))}</li>`;
    $("activityPeek").textContent = log.length ? `· ${logLine(log[0])}` : "";
  }

  paint() {
    const s = this.state;
    if (!s) return;

    const ms = this.remainingMs();
    const label = fmt(ms);
    $("time").textContent = label;
    $("timePlain").textContent = label;

    const total = s.settings[s.phase] * 60_000;
    $("progress").style.width = `${Math.min(100, Math.max(0, (1 - ms / total) * 100))}%`;

    const roundInCycle = (s.round % s.settings.roundsBeforeLong) + (s.phase === "focus" ? 1 : 0);
    const shown = Math.min(s.settings.roundsBeforeLong, Math.max(1, roundInCycle));
    const args = { phase: t(`phase.${s.phase}`), n: shown, of: s.settings.roundsBeforeLong, done: s.completed };
    const metaText = t(s.completed === 0 ? "room.meta" : s.completed === 1 ? "room.metaDone1" : "room.metaDone", args);
    $("meta").textContent = metaText;
    $("metaPlain").textContent = metaText;

    document.title = `${label} · ${t(`phase.${s.phase}`)}${s.running ? "" : t("room.titlePaused")}`;

    // Keep the "2m ago" stamps honest without redrawing on every frame.
    if (Date.now() - this.activityPaintedAt > 15_000) {
      this.paintActivity();
      // Not while somebody is reaching for a note: replacing the list would
      // pull the button out from under the pointer.
      const board = document.querySelector(".panel--board");
      if (!board.matches(":hover") && !board.contains(document.activeElement)) this.renderNotes();
    }
  }

  setPresence(kind) {
    const dot = $("presenceDot");
    dot.classList.toggle("live", kind === "live");
    dot.classList.toggle("down", kind === "down");
    $("connStatus").textContent = kind === "live" ? t("conn.live") : t("conn.down");
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
        toast(t("ctl.copied"));
      } catch {
        prompt(t("ctl.copyPrompt"), link);
      }
    };

    $("rename").onclick = async () => {
      const { name, icon } = await askIdentity(this.id, true);
      this.name = name; // so a reconnect keeps them
      this.icon = icon;
      if (name) this.send({ type: "name", name });
      this.send({ type: "icon", icon });
      if (!name) toast(t("gate.anonAfter"));
    };

    $("toggleRoom").onclick = () => {
      this.roomHidden = !this.roomHidden;
      writePref(ROOM_PREF_KEY, this.roomHidden ? "1" : "0");
      if (this.roomHidden && this.decorating) this.setDecorating(false);
      this.applyRoomVisibility();
    };

    $("wallBtn").onclick = () => {
      if (this.roomHidden) {
        this.roomHidden = false;
        writePref(ROOM_PREF_KEY, "0");
      } else {
        this.wallHidden = !this.wallHidden;
        writePref(WALL_PREF_KEY, this.wallHidden ? "1" : "0");
      }
      this.applyRoomVisibility();
    };

    $("decorateBtn").onclick = () => {
      if (this.roomHidden) {
        this.roomHidden = false;
        writePref(ROOM_PREF_KEY, "0");
        this.applyRoomVisibility();
      }
      this.setDecorating(!this.decorating);
    };
    $("doneDecorating").onclick = () => this.setDecorating(false);
    $("undoLayout").onclick = () => this.send({ type: "undoLayout" });
    $("resetLayout").onclick = () => {
      if (confirm(t("dec.confirmReset"))) this.send({ type: "resetLayout" });
    };

    $("clearWall").onclick = () => {
      if (confirm(t("wall.confirmClear"))) this.send({ type: "clearWall" });
    };
    $("undoWall").onclick = () => this.send({ type: "undoWall" });

    $("postNote").onclick = () => this.postNote();
    $("noteInput").onkeydown = (e) => {
      // Enter posts, Shift+Enter is a new line — a note is usually one line.
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.postNote();
      }
    };
    $("boardList").addEventListener("scroll", () => this.markBoardEdges(), { passive: true });
    for (const el of [$("boardList"), $("noteInput")]) {
      el.addEventListener("focusin", () => this.markBoardSeen());
      el.addEventListener("click", () => this.markBoardSeen());
    }

    $("deleteBtn").onclick = () => this.openDelete();
    $("delCancel").onclick = () => ($("deleteGate").hidden = true);
    $("deleteForm").onsubmit = (e) => {
      e.preventDefault();
      const typed = $("delInput").value.trim().toLowerCase();
      if (typed !== this.id) return toast(t("del.mismatch"));
      $("deleteGate").hidden = true;
      this.send({ type: "deleteRoom", confirm: this.id });
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

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** The eraser button's rubber, drawn rather than set in a glyph. */
let rubberUrl = null;
function rubberIcon() {
  if (rubberUrl) return rubberUrl;
  const { w, h } = spriteSize(ERASER);
  const scale = 3;
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);
  blit(ctx, ERASER, 0, 0);
  rubberUrl = c.toDataURL();
  return rubberUrl;
}

/** A furniture thumbnail for the palette, drawn from the same sprite data. */
const thumbs = new Map();
function itemThumb(id) {
  const hit = thumbs.get(id);
  if (hit) return hit;
  const { w, h } = itemSize(id);
  const scale = Math.max(1, Math.min(3, Math.floor(46 / w) || 1));
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);
  paintItem(ctx, id, 0, 0);
  const url = c.toDataURL();
  thumbs.set(id, url);
  return url;
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
  const t0 = audioCtx.currentTime + 0.02;
  const notes = finishedFocus
    ? [ [587.33, 0.0], [880.0, 0.16], [1174.66, 0.32] ]   // work done: rising, "go rest"
    : [ [880.0, 0.0], [659.25, 0.18], [523.25, 0.36] ];    // rest done: falling, "back to it"
  for (const [freq, offset] of notes) tone(freq, t0 + offset, 0.5, 0.65);
  // A second pass a beat later — a notification you can miss isn't one.
  for (const [freq, offset] of notes) tone(freq, t0 + 0.9 + offset, 0.5, 0.55);
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

initLang();
buildLangPickers();
applyI18n();
addEventListener("popstate", route);
route();
