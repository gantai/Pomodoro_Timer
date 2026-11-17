/* The pixel room: layout, movement and rendering.
 *
 * Everything is drawn at a fixed logical size (ROOM_W × ROOM_H) and scaled up
 * by a whole number, so pixels stay square and crisp at any window size.
 * Positions on the wire are in logical pixels, which keeps every screen
 * agreeing on where people are regardless of how big their window is.
 *
 * Furniture is baked into an offscreen canvas and re-baked only when the
 * layout changes, so a frame is one drawImage plus the people. People draw
 * over furniture by design — there is no collision and no depth sorting.
 */

import {
  PAL, FACINGS, FLIP_FACING, walkCycle, paletteFor, blit, spriteSize, iconById,
  CATALOGUE, DEFAULT_LAYOUT, itemSize, paintItem,
} from "./art.js";

export const TILE = 16;
export const COLS = 20;
export const ROWS = 12;
export const ROOM_W = COLS * TILE; // 320
export const ROOM_H = ROWS * TILE; // 192

const WALL_ROWS = 2;
/** The wallpaper band at the top. The clock is mounted inside it. */
export const FLOOR_TOP = WALL_ROWS * TILE;
const SPEED = 46; // logical px per second
const GRID = 8; // placement snaps to half a tile

/** Where people are put when they arrive, in order. */
const SEATS = [
  [2 * TILE, 5 * TILE + 10],
  [6 * TILE + 8, 5 * TILE + 10],
  [11 * TILE + 8, 5 * TILE + 10],
  [16 * TILE, 5 * TILE + 10],
  [6 * TILE, 8 * TILE + 4],
  [13 * TILE, 8 * TILE + 4],
  [8 * TILE, 11 * TILE],
  [12 * TILE, 11 * TILE],
];

export function seatFor(index) {
  const [x, y] = SEATS[index % SEATS.length];
  const lap = Math.floor(index / SEATS.length);
  return { x: x + lap * 5, y: y + lap * 4 };
}

const snap = (n) => Math.round(n / GRID) * GRID;

/** People stay inside the room; furniture does not stop them. */
function clampToRoom(x, y) {
  return {
    x: Math.max(6, Math.min(ROOM_W - 6, x)),
    y: Math.max(FLOOR_TOP + 8, Math.min(ROOM_H - 2, y)),
  };
}

/* ── floor and wall ────────────────────────────────────────────────────── */

function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function paintBackdrop(ctx) {
  ctx.fillStyle = PAL.n;
  ctx.fillRect(0, 0, ROOM_W, FLOOR_TOP);
  ctx.fillStyle = "rgba(255,255,255,0.33)";
  for (let x = 0; x < ROOM_W; x += 10) ctx.fillRect(x, 0, 5, FLOOR_TOP);
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(0, FLOOR_TOP - 12, ROOM_W, 1);
  ctx.fillStyle = PAL.e;
  ctx.fillRect(0, FLOOR_TOP - 5, ROOM_W, 5);
  ctx.fillStyle = PAL["0"];
  ctx.fillRect(0, FLOOR_TOP - 6, ROOM_W, 1);

  // Long horizontal boards. Seams are faint and board ends rare — a hard
  // grid every few pixels reads as brickwork, not timber.
  ctx.fillStyle = PAL.D;
  ctx.fillRect(0, FLOOR_TOP, ROOM_W, ROOM_H - FLOOR_TOP);
  let band = 0;
  for (let y = FLOOR_TOP; y < ROOM_H; y += 10, band++) {
    ctx.fillStyle = band % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.035)";
    ctx.fillRect(0, y, ROOM_W, 10);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, y + 9, ROOM_W, 1);
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    ctx.fillRect((band * 83) % ROOM_W, y, 1, 9);
    for (let x = 0; x < ROOM_W; x += 6) {
      if (noise(x, y) > 0.86) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x, y + 2 + ((x + band) % 6), 4, 1);
      }
    }
  }
}

/* ── the scene ─────────────────────────────────────────────────────────── */

export class PixelRoom {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onMove: Function, onPlace: Function, onRemove: Function, onMoveItem: Function}} hooks
   */
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.onMove = hooks.onMove || (() => {});
    this.onPlace = hooks.onPlace || (() => {});
    this.onRemove = hooks.onRemove || (() => {});
    this.onMoveItem = hooks.onMoveItem || (() => {});

    this.people = new Map();
    this.meId = null;
    this.keys = new Set();
    this.target = null;
    this.lastSent = 0;
    this.phase = "focus";
    this.running = false;
    this.raf = null;
    this.last = 0;

    this.layout = DEFAULT_LAYOUT;
    this.editing = false;
    this.tool = "move"; // "move", "erase", or a catalogue id to place
    this.hover = null;
    this.drag = null; // the piece in hand while moving furniture

    this.bg = document.createElement("canvas");
    this.bg.width = ROOM_W;
    this.bg.height = ROOM_H;
    this.bgx = this.bg.getContext("2d");
    this.bgx.imageSmoothingEnabled = false;
    this.bake();

    this.bindInput();
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = null;
    removeEventListener("keydown", this._kd);
    removeEventListener("keyup", this._ku);
    removeEventListener("blur", this._blur);
    removeEventListener("resize", this._rs);
  }

  /* --- layout --- */

  /** Re-draw the room's furniture into the offscreen canvas. */
  bake() {
    paintBackdrop(this.bgx);
    this.layout.forEach((item, k) => {
      // The piece being carried is drawn live, following the pointer, so it
      // is left out of the baked room — otherwise it would be in two places.
      if (this.drag && this.drag.k === k) return;
      if (CATALOGUE[item.i]) paintItem(this.bgx, item.i, item.x, item.y);
    });
  }

  setLayout(layout) {
    if (!Array.isArray(layout)) return;
    this.layout = layout;
    // Someone else changed the room mid-drag; the index we were holding may
    // now point at a different piece, so let go rather than move the wrong one.
    if (this.drag) {
      const it = layout[this.drag.k];
      if (!it || it.i !== this.drag.i || it.x !== this.drag.fromX || it.y !== this.drag.fromY) this.drag = null;
    }
    this.bake();
  }

  setEditing(on, tool) {
    this.editing = on;
    if (tool) this.tool = tool;
    if (!on) this.hover = null;
    if (this.drag) {
      this.drag = null;
      this.bake();
    }
    this.canvas.style.cursor = on ? (this.tool === "move" ? "default" : "crosshair") : "pointer";
  }

  /** Topmost item under a point — the last one placed wins. */
  itemAt(x, y) {
    for (let k = this.layout.length - 1; k >= 0; k--) {
      const it = this.layout[k];
      const { w, h } = itemSize(it.i);
      if (x >= it.x && x < it.x + w && y >= it.y && y < it.y + h) return k;
    }
    return -1;
  }

  /* --- sizing: integer scale only, so pixels stay square --- */

  /**
   * `extraH` is logical height stacked under the room that has to share the
   * same whole-number scale — the doodle wall. Without it the room would take
   * the whole window and push the wall off the bottom.
   */
  setExtraHeight(h) {
    this.extraH = h || 0;
    this.resize();
  }

  resize() {
    const host = this.canvas.closest(".scene") || this.canvas.parentElement;
    const avail = host.getBoundingClientRect().width || window.innerWidth;
    // Room for the bar, the phases, the controls, the progress and the hints.
    const budget = Math.max(ROOM_H, window.innerHeight - 340);
    const stack = ROOM_H + (this.extraH || 0);
    const scale = Math.max(1, Math.floor(Math.min(avail / ROOM_W, budget / stack)));
    this.scale = scale;
    this.canvas.width = ROOM_W;
    this.canvas.height = ROOM_H;
    this.canvas.style.width = `${ROOM_W * scale}px`;
    this.canvas.style.height = `${ROOM_H * scale}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  /* --- input --- */

  pointAt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  }

  bindInput() {
    const KEYS = {
      ArrowUp: "u", KeyW: "u",
      ArrowDown: "d", KeyS: "d",
      ArrowLeft: "l", KeyA: "l",
      ArrowRight: "r", KeyD: "r",
    };

    this._kd = (e) => {
      if (e.target.matches?.("input, textarea, select")) return;
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      this.keys.add(k);
      this.target = null;
    };
    this._ku = (e) => {
      const k = KEYS[e.code];
      if (k) this.keys.delete(k);
    };
    this._blur = () => this.keys.clear();
    this._rs = () => this.resize();

    addEventListener("keydown", this._kd);
    addEventListener("keyup", this._ku);
    addEventListener("blur", this._blur);
    addEventListener("resize", this._rs);

    this.canvas.addEventListener("pointerdown", (e) => {
      const p = this.pointAt(e);
      if (!this.editing) {
        this.target = { x: p.x, y: Math.max(FLOOR_TOP + 8, p.y) };
        return;
      }
      if (this.tool === "erase") {
        const k = this.itemAt(p.x, p.y);
        if (k >= 0) this.onRemove(k);
        return;
      }
      if (this.tool === "move") {
        const k = this.itemAt(p.x, p.y);
        if (k < 0) return;
        const it = this.layout[k];
        // Hold it by the point you grabbed, not by its corner, so it doesn't
        // jump under the pointer the moment you pick it up.
        this.drag = { k, i: it.i, fromX: it.x, fromY: it.y, dx: p.x - it.x, dy: p.y - it.y, x: it.x, y: it.y };
        this.canvas.setPointerCapture?.(e.pointerId);
        this.canvas.style.cursor = "grabbing";
        this.bake();
        return;
      }
      const { w, h } = itemSize(this.tool);
      this.onPlace(this.tool, snap(p.x - w / 2), snap(p.y - h / 2));
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.editing) return;
      const p = this.pointAt(e);
      this.hover = p;
      if (this.tool !== "move") return;
      if (this.drag) {
        this.drag.x = snap(p.x - this.drag.dx);
        this.drag.y = snap(p.y - this.drag.dy);
      } else {
        this.canvas.style.cursor = this.itemAt(p.x, p.y) >= 0 ? "grab" : "default";
      }
    });

    const drop = () => {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      if (d.x !== d.fromX || d.y !== d.fromY) {
        // Put it down here at once; the server's layout follows and confirms.
        this.layout = this.layout.map((o, n) => (n === d.k ? { ...o, x: d.x, y: d.y } : o));
        this.onMoveItem(d.k, d);
      }
      this.canvas.style.cursor = "grab";
      this.bake();
    };
    this.canvas.addEventListener("pointerup", drop);
    this.canvas.addEventListener("pointercancel", () => {
      this.drag = null;
      this.bake();
    });
    this.canvas.addEventListener("pointerleave", () => {
      if (!this.drag) this.hover = null; // a captured drag keeps going off the edge
    });
  }

  /* --- people --- */

  setMe(id) {
    this.meId = id;
  }

  syncMembers(members) {
    const seen = new Set();
    members.forEach((m, i) => {
      seen.add(m.id);
      const existing = this.people.get(m.id);
      if (existing) {
        existing.name = m.name;
        if (existing.icon !== m.icon) {
          existing.icon = m.icon;
          existing.frames = null;
        }
        return;
      }
      const seat = seatFor(i);
      this.people.set(m.id, {
        ...seat,
        d: 0,
        moving: false,
        step: 0,
        name: m.name,
        icon: m.icon,
        pal: paletteFor(m.id),
        tx: seat.x,
        ty: seat.y,
        placed: false, // the seat is a guess until they say where they are
      });
    });
    for (const id of [...this.people.keys()]) if (!seen.has(id)) this.people.delete(id);
  }

  setPosition(id, x, y, d, moving) {
    const p = this.people.get(id);
    if (!p || id === this.meId) return;
    p.tx = x;
    p.ty = y;
    p.d = d;
    p.moving = moving;
    // The first word of where someone is isn't a walk. Tweening from the
    // guessed seat sent people strolling across the room on every reload.
    if (!p.placed) {
      p.x = x;
      p.y = y;
      p.placed = true;
    }
  }

  /** Put yourself somewhere outright — used to restore where you were. */
  placeMe(x, y, d = 0) {
    const me = this.people.get(this.meId);
    if (!me) return;
    const p = clampToRoom(x, y);
    me.x = me.tx = p.x;
    me.y = me.ty = p.y;
    me.d = [0, 1, 2, 3].includes(d) ? d : 0;
    me.moving = false;
  }

  myPosition() {
    const me = this.people.get(this.meId);
    return me ? { x: Math.round(me.x), y: Math.round(me.y), d: me.d, moving: me.moving } : null;
  }

  setPhase(phase, running) {
    this.phase = phase;
    this.running = running;
  }

  /* --- loop --- */

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  update(dt) {
    const me = this.people.get(this.meId);
    if (me) {
      let dx = 0;
      let dy = 0;
      if (this.keys.has("l")) dx -= 1;
      if (this.keys.has("r")) dx += 1;
      if (this.keys.has("u")) dy -= 1;
      if (this.keys.has("d")) dy += 1;

      if (!dx && !dy && this.target) {
        const ax = this.target.x - me.x;
        const ay = this.target.y - me.y;
        if (Math.hypot(ax, ay) < 2) this.target = null;
        else {
          dx = Math.abs(ax) < 1 ? 0 : Math.sign(ax);
          dy = Math.abs(ay) < 1 ? 0 : Math.sign(ay);
        }
      }

      const moving = Boolean(dx || dy);
      if (moving) {
        const len = Math.hypot(dx, dy) || 1;
        const step = SPEED * dt;
        const next = clampToRoom(me.x + (dx / len) * step, me.y + (dy / len) * step);
        me.x = next.x;
        me.y = next.y;

        if (dy > 0) me.d = 0;
        else if (dy < 0) me.d = 2;
        if (dx > 0) me.d = 3;
        else if (dx < 0) me.d = 1;

        me.step += dt * 8;
      } else {
        me.step = 0;
      }

      const changed = moving !== me.moving;
      me.moving = moving;
      const now = performance.now();
      if ((moving && now - this.lastSent > 100) || changed) {
        this.lastSent = now;
        this.onMove(this.myPosition());
      }
    }

    for (const [id, p] of this.people) {
      if (id === this.meId) continue;
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.3) {
        p.x = p.tx;
        p.y = p.ty;
        p.step = 0;
        continue;
      }
      const k = dist > 40 ? 1 : Math.min(1, dt / 0.12);
      p.x += dx * k;
      p.y += dy * k;
      p.step += dt * 8;
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0);

    // People draw over the furniture, lower ones last so they overlap.
    const sorted = [...this.people.values()].sort((a, b) => a.y - b.y);
    for (const p of sorted) this.drawPerson(ctx, p);

    this.tint(ctx);
    if (this.editing) this.drawEditOverlay(ctx);
  }

  drawPerson(ctx, p) {
    const icon = iconById(p.icon);
    const animal = Boolean(icon.sprite);
    const base = animal ? icon.sprite : FACINGS[p.d];
    const tint = animal ? icon.tint : p.pal;
    const flip = animal ? p.d === 1 : p.d === FLIP_FACING;

    if (!p.frames || p.frames.base !== base) {
      p.frames = { base, cycle: walkCycle(base) };
    }
    const frame = p.moving ? p.frames.cycle[Math.floor(p.step) % 4] : base;
    const { w, h } = spriteSize(frame);
    const x = Math.round(p.x - w / 2);
    const y = Math.round(p.y - h);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x + 2, p.y - 2, w - 4, 2);

    blit(ctx, frame, x, y, tint, flip);
  }

  /** Grid and a preview of what you are about to put down. */
  drawEditOverlay(ctx) {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let x = 0; x < ROOM_W; x += GRID) ctx.fillRect(x, 0, 1, ROOM_H);
    for (let y = 0; y < ROOM_H; y += GRID) ctx.fillRect(0, y, ROOM_W, 1);
    if (this.tool === "move") {
      if (this.drag) {
        // The piece in hand, with its outline, where it would land.
        const { w, h } = itemSize(this.drag.i);
        ctx.globalAlpha = 0.85;
        paintItem(ctx, this.drag.i, this.drag.x, this.drag.y);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        ctx.strokeRect(this.drag.x - 0.5, this.drag.y - 0.5, w + 1, h + 1);
        return;
      }
      if (!this.hover) return;
      const k = this.itemAt(this.hover.x, this.hover.y);
      if (k < 0) return;
      const it = this.layout[k];
      const { w, h } = itemSize(it.i);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1;
      ctx.strokeRect(it.x - 0.5, it.y - 0.5, w + 1, h + 1);
      return;
    }

    if (!this.hover) return;

    if (this.tool === "erase") {
      const k = this.itemAt(this.hover.x, this.hover.y);
      if (k < 0) return;
      const it = this.layout[k];
      const { w, h } = itemSize(it.i);
      ctx.fillStyle = "rgba(200,60,50,0.35)";
      ctx.fillRect(it.x, it.y, w, h);
      return;
    }

    const { w, h } = itemSize(this.tool);
    const x = snap(this.hover.x - w / 2);
    const y = snap(this.hover.y - h / 2);
    ctx.globalAlpha = 0.6;
    paintItem(ctx, this.tool, x, y);
    ctx.globalAlpha = 1;
  }

  tint(ctx) {
    const wash =
      this.phase === "focus"
        ? "rgba(90, 50, 20, 0.16)"
        : this.phase === "short"
          ? "rgba(70, 140, 110, 0.10)"
          : "rgba(70, 110, 170, 0.12)";
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);

    const g = ctx.createRadialGradient(ROOM_W / 2, ROOM_H / 2, ROOM_H * 0.35, ROOM_W / 2, ROOM_H / 2, ROOM_H * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.33)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
  }

  /**
   * Where each name tag goes. `top` is the line the tag's *bottom* sits on —
   * the CSS pulls it up by its own height — so the tag clears the top of the
   * head whatever the sprite's height and whatever the scale. Anchoring by
   * the top edge instead, as this did, put the tag over the character's face:
   * the gap was a fixed number of room pixels while the tag's height is a
   * fixed number of screen pixels, so at every scale it overlapped.
   */
  labelPositions() {
    const out = [];
    for (const [id, p] of this.people) {
      const icon = iconById(p.icon);
      const { h } = spriteSize(icon.sprite || FACINGS[0]);
      out.push({
        id,
        name: p.name,
        me: id === this.meId,
        left: Math.round(p.x * this.scale),
        top: Math.round((p.y - h - 2) * this.scale),
      });
    }
    return out;
  }
}
