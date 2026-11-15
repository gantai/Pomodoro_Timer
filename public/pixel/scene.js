/* The pixel room: layout, collision, movement and rendering.
 *
 * Everything is drawn at a fixed logical size (ROOM_W × ROOM_H) and scaled up
 * by a whole number, so pixels stay square and crisp at any window size.
 * Positions on the wire are in logical pixels, which keeps every screen
 * agreeing on where people are regardless of how big their window is.
 */

import {
  PAL, DESK, SHELF, PLANT, CHAIR, CAT, WINDOW, CLOCK,
  FACINGS, FLIP_FACING, walkCycle, paletteFor, blit, spriteSize, iconById,
} from "./art.js";

export const TILE = 16;
export const COLS = 20;
export const ROWS = 12;
export const ROOM_W = COLS * TILE; // 320
export const ROOM_H = ROWS * TILE; // 192

const WALL_ROWS = 2;              // back wall occupies the top two rows
const FLOOR_TOP = WALL_ROWS * TILE;
const SPEED = 46;                 // logical px per second
const FOOT_W = 8;                 // collision box at the feet
const FOOT_H = 5;

/* ── furniture layout ──────────────────────────────────────────────────────
   x,y are in logical pixels, anchored at the sprite's top-left. `solid` is
   the footprint you cannot walk through, relative to the same anchor. */

const DESK_Y = 3 * TILE - 4;

const FURNITURE = [
  // Back wall. The clock sits off-centre so the timer HUD doesn't cover it.
  { art: WINDOW, x: 3 * TILE, y: 3, solid: null },
  { art: CLOCK, x: 6 * TILE + 4, y: 5, solid: null },
  { art: WINDOW, x: 13 * TILE, y: 3, solid: null },
  { art: SHELF, x: 0, y: FLOOR_TOP - 12, solid: { x: 0, y: 12, w: 16, h: 14 } },
  { art: SHELF, x: 18 * TILE, y: FLOOR_TOP - 12, solid: { x: 0, y: 12, w: 16, h: 14 } },

  // Four workstations across the top of the floor.
  { art: DESK, x: 1 * TILE, y: DESK_Y, solid: { x: 0, y: 8, w: 32, h: 14 } },
  { art: CHAIR, x: 2 * TILE, y: 5 * TILE, solid: null },
  { art: DESK, x: 5 * TILE + 8, y: DESK_Y, solid: { x: 0, y: 8, w: 32, h: 14 } },
  { art: CHAIR, x: 6 * TILE + 8, y: 5 * TILE, solid: null },
  { art: DESK, x: 10 * TILE + 8, y: DESK_Y, solid: { x: 0, y: 8, w: 32, h: 14 } },
  { art: CHAIR, x: 11 * TILE + 8, y: 5 * TILE, solid: null },
  { art: DESK, x: 15 * TILE, y: DESK_Y, solid: { x: 0, y: 8, w: 32, h: 14 } },
  { art: CHAIR, x: 16 * TILE, y: 5 * TILE, solid: null },

  // Lounge corner around the rug.
  { art: CHAIR, x: 4 * TILE, y: 7 * TILE + 10, solid: null },
  { art: CHAIR, x: 15 * TILE, y: 7 * TILE + 10, solid: null },
  { art: PLANT, x: 1 * TILE, y: 6 * TILE + 8, solid: { x: 3, y: 11, w: 10, h: 6 } },
  { art: PLANT, x: 17 * TILE + 6, y: 6 * TILE + 8, solid: { x: 3, y: 11, w: 10, h: 6 } },

  // Floor-standing shelves anchor the bottom corners.
  { art: SHELF, x: 0, y: 10 * TILE, solid: { x: 0, y: 4, w: 16, h: 17 } },
  { art: SHELF, x: 18 * TILE, y: 10 * TILE, solid: { x: 0, y: 4, w: 16, h: 17 } },

  { art: CAT, x: 9 * TILE + 4, y: 8 * TILE, solid: null },
];

/** Where people are put when they arrive, in order: the desks, then the rug. */
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
  // Nudge overflow arrivals so a ninth person doesn't stand inside the eighth.
  const lap = Math.floor(index / SEATS.length);
  return { x: x + lap * 5, y: y + lap * 4 };
}

/* ── collision ─────────────────────────────────────────────────────────── */

function buildSolids() {
  const boxes = [];
  for (const item of FURNITURE) {
    if (!item.solid) continue;
    boxes.push({
      x: item.x + item.solid.x,
      y: item.y + item.solid.y,
      w: item.solid.w,
      h: item.solid.h,
    });
  }
  return boxes;
}

const SOLIDS = buildSolids();

function blocked(x, y) {
  // Feet box centred on x, sitting just above y.
  const l = x - FOOT_W / 2;
  const r = x + FOOT_W / 2;
  const t = y - FOOT_H;
  const b = y;
  if (l < 2 || r > ROOM_W - 2 || t < FLOOR_TOP + 2 || b > ROOM_H - 2) return true;
  for (const s of SOLIDS) {
    if (r > s.x && l < s.x + s.w && b > s.y && t < s.y + s.h) return true;
  }
  return false;
}

export const _test = { blocked, SOLIDS, buildSolids };

/* ── floor and wall, drawn procedurally ────────────────────────────────── */

function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function paintBackdrop(ctx) {
  // ── wall: soft vertical stripes, a picture rail and a skirting board
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

  // ── floor: long horizontal boards. Seams are faint and board ends are
  // rare — a hard grid every few pixels reads as brickwork, not timber.
  ctx.fillStyle = PAL.D;
  ctx.fillRect(0, FLOOR_TOP, ROOM_W, ROOM_H - FLOOR_TOP);

  let band = 0;
  for (let y = FLOOR_TOP; y < ROOM_H; y += 10, band++) {
    ctx.fillStyle = band % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.035)";
    ctx.fillRect(0, y, ROOM_W, 10);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, y + 9, ROOM_W, 1);
    // One board end per row, staggered.
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    ctx.fillRect((band * 83) % ROOM_W, y, 1, 9);
    // Grain: a few short dashes, deterministic so nothing shimmers.
    for (let x = 0; x < ROOM_W; x += 6) {
      if (noise(x, y) > 0.86) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x, y + 2 + ((x + band) % 6), 4, 1);
      }
    }
  }

  // ── rug
  const rx = 6 * TILE;
  const ry = 7 * TILE;
  const rw = 8 * TILE;
  const rh = 40;
  ctx.fillStyle = PAL["0"];
  ctx.fillRect(rx + 1, ry, rw - 2, rh);
  ctx.fillRect(rx, ry + 1, rw, rh - 2);
  ctx.fillStyle = PAL.r;
  ctx.fillRect(rx + 1, ry + 1, rw - 2, rh - 2);
  ctx.fillStyle = PAL.o;
  ctx.fillRect(rx + 4, ry + 3, rw - 8, rh - 6);
  ctx.fillStyle = PAL.r;
  ctx.fillRect(rx + 6, ry + 5, rw - 12, rh - 10);
  // Simple woven motif rather than a flat slab.
  ctx.fillStyle = PAL.o;
  for (let x = rx + 10; x < rx + rw - 10; x += 8) {
    ctx.fillRect(x, ry + rh / 2 - 2, 4, 4);
  }
  // Fringe
  ctx.fillStyle = PAL.n;
  for (let x = rx + 2; x < rx + rw - 2; x += 4) {
    ctx.fillRect(x, ry - 2, 2, 2);
    ctx.fillRect(x, ry + rh, 2, 2);
  }
}

/* ── the scene ─────────────────────────────────────────────────────────── */

export class PixelRoom {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(pos: {x:number,y:number,d:number,moving:boolean}) => void} onMove
   *        called at most ~10×/sec while walking, and once on stop
   */
  constructor(canvas, onMove) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.onMove = onMove;

    this.people = new Map(); // id → {x, y, d, moving, name, pal, frames, step, tx, ty}
    this.meId = null;
    this.keys = new Set();
    this.target = null; // click-to-walk destination
    this.lastSent = 0;
    this.phase = "focus";
    this.running = false;
    this.raf = null;
    this.last = 0;

    // Backdrop never changes, so paint it once into an offscreen canvas and
    // blit it each frame instead of redrawing a few thousand rects at 60fps.
    this.bg = document.createElement("canvas");
    this.bg.width = ROOM_W;
    this.bg.height = ROOM_H;
    const bgx = this.bg.getContext("2d");
    bgx.imageSmoothingEnabled = false;
    paintBackdrop(bgx);
    for (const item of FURNITURE) {
      if (item.art === CAT) continue; // drawn with the people, so it can overlap
      blit(bgx, item.art, item.x, item.y);
    }

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

  /* --- sizing: integer scale only, so pixels stay square --- */

  resize() {
    // Measure the stage, not the immediate parent: the frame is sized *by*
    // the canvas, so asking it how much room there is answers itself.
    const host = this.canvas.closest(".scene") || this.canvas.parentElement;
    const avail = host.getBoundingClientRect().width || window.innerWidth;
    // Leave the clock, controls and rail their share of the height.
    const budget = Math.max(ROOM_H, window.innerHeight - 300);
    const scale = Math.max(1, Math.floor(Math.min(avail / ROOM_W, budget / ROOM_H)));
    this.scale = scale;
    this.canvas.width = ROOM_W;
    this.canvas.height = ROOM_H;
    this.canvas.style.width = `${ROOM_W * scale}px`;
    this.canvas.style.height = `${ROOM_H * scale}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  /* --- input --- */

  bindInput() {
    const KEYS = {
      ArrowUp: "u", KeyW: "u",
      ArrowDown: "d", KeyS: "d",
      ArrowLeft: "l", KeyA: "l",
      ArrowRight: "r", KeyD: "r",
    };

    this._kd = (e) => {
      // Never steal keys from the settings fields or the name dialog.
      if (e.target.matches?.("input, textarea, select")) return;
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      this.keys.add(k);
      this.target = null; // keyboard overrides click-to-walk
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

    // Click or tap a spot to walk there — the only way in on a phone.
    this.canvas.addEventListener("pointerdown", (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / this.scale;
      const y = (e.clientY - r.top) / this.scale;
      this.target = { x, y: Math.max(FLOOR_TOP + FOOT_H + 2, y) };
    });
  }

  /* --- people --- */

  setMe(id) {
    this.meId = id;
  }

  /** Reconcile with the room's member list; keeps positions for those staying. */
  syncMembers(members) {
    const seen = new Set();
    members.forEach((m, i) => {
      seen.add(m.id);
      const existing = this.people.get(m.id);
      if (existing) {
        existing.name = m.name;
        if (existing.icon !== m.icon) {
          existing.icon = m.icon;
          existing.frames = null; // force the walk cycle to rebuild
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
      });
    });
    for (const id of [...this.people.keys()]) if (!seen.has(id)) this.people.delete(id);
  }

  /** A position update for somebody else. */
  setPosition(id, x, y, d, moving) {
    const p = this.people.get(id);
    if (!p || id === this.meId) return;
    // Store as a target and glide toward it, so 10 updates/sec still look
    // like smooth walking at 60fps.
    p.tx = x;
    p.ty = y;
    p.d = d;
    p.moving = moving;
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
        const nx = me.x + (dx / len) * step;
        const ny = me.y + (dy / len) * step;
        // Separate axes so you slide along a desk instead of sticking to it.
        if (!blocked(nx, me.y)) me.x = nx;
        else if (this.target) this.target = null;
        if (!blocked(me.x, ny)) me.y = ny;
        else if (this.target) this.target = null;

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

    // Everyone else glides toward their last reported position.
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
      // Catch up over ~120ms; snap if we are badly behind (tab was hidden).
      const k = dist > 40 ? 1 : Math.min(1, dt / 0.12);
      p.x += dx * k;
      p.y += dy * k;
      p.step += dt * 8;
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0);

    const cat = FURNITURE.find((f) => f.art === CAT);

    // Painter's algorithm: lower on screen draws later, so it overlaps.
    const drawables = [...this.people.values()].map((p) => ({ p, y: p.y }));
    drawables.push({ cat, y: cat.y + spriteSize(CAT).h });
    drawables.sort((a, b) => a.y - b.y);

    for (const item of drawables) {
      if (item.cat) {
        blit(ctx, CAT, item.cat.x, item.cat.y);
        continue;
      }
      this.drawPerson(ctx, item.p);
    }

    this.tint(ctx);
  }

  drawPerson(ctx, p) {
    // Animals have one pose and face the viewer; the human has three facings.
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

    // Soft contact shadow so people sit on the floor rather than float.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x + 2, p.y - 2, w - 4, 2);

    blit(ctx, frame, x, y, tint, flip);
  }

  /** Phase colour as room light: warm and low on focus, bright on a break. */
  tint(ctx) {
    const wash =
      this.phase === "focus"
        ? "rgba(90, 50, 20, 0.16)"
        : this.phase === "short"
          ? "rgba(70, 140, 110, 0.10)"
          : "rgba(70, 110, 170, 0.12)";
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);

    // A vignette keeps the eye on the middle of the room.
    const g = ctx.createRadialGradient(ROOM_W / 2, ROOM_H / 2, ROOM_H * 0.35, ROOM_W / 2, ROOM_H / 2, ROOM_H * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.33)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
  }

  /** Screen positions for the DOM name labels, in CSS pixels. */
  labelPositions() {
    const out = [];
    for (const [id, p] of this.people) {
      out.push({
        id,
        name: p.name,
        me: id === this.meId,
        left: Math.round(p.x * this.scale),
        top: Math.round((p.y - 17) * this.scale),
      });
    }
    return out;
  }
}
