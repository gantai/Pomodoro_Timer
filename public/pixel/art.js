/* Pixel art for the room.
 *
 * No asset pack: every sprite is a grid of characters mapped through a shared
 * palette, drawn to a canvas one logical pixel at a time. Authoring art as
 * text keeps it diffable, recolourable (see tint maps below) and tiny — the
 * whole set is a few KB and costs no extra requests.
 *
 * Sprite characters:
 *   .  transparent        0  outline
 *   H  hair    S  skin    T  shirt   P  trousers   O  shoes   (per-person)
 * Everything else is a fixed palette entry.
 */

export const PAL = {
  "0": "#2a2018", // outline
  k: "#1b1511",

  // wood
  D: "#8a5a33",
  d: "#6f4526",
  e: "#523321",
  f: "#a06c41",

  // wall / paper
  w: "#f1ead9",
  W: "#ffffff",
  n: "#ded2b8",

  // metal
  s: "#8d8d96",
  S: "#b9b9c2",

  // greens
  g: "#4a8a50",
  G: "#63ab68",
  h: "#2f5f36",

  // warm light
  y: "#efc277",
  Y: "#ffe6ab",

  // accents
  r: "#b8463c",
  R: "#d9675a",
  b: "#3e6ea8",
  B: "#6fa0d8",
  p: "#8b5e9c",
  o: "#cf8a45",
};

/* ── furniture ─────────────────────────────────────────────────────────── */

/** Two tiles wide: a 16px desk read as a bedside table next to a person. */
export const DESK = [
  "................................",
  "..........00000000..............",
  ".........0SSSSSSSS0.............",
  ".........0SbbbbbbS0.............",
  ".........0SbbbbbbS0.............",
  ".........0SSSSSSSS0.............",
  "..........0ssssss0..............",
  "...........0ssss0...............",
  "00000000000000000000000000000000",
  "0DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD0",
  "0DDwwwDDDDDDDDDDDDDDDDDD0yy0DDD0",
  "0DDwwwDDDDDDDDDDDDDDDDDD0YY0DDD0",
  "0DDDDDDDDDDDDDDDDDDDDDDDD00DDDD0",
  "0DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD0",
  "0eeeeeeeeeeeeeeeeeeeeeeeeeeeeee0",
  "0e0000000000000000000000000000e0",
  "0e............................e0",
  "00............................00",
];

export const SHELF = [
  "0000000000000000",
  "0DDDDDDDDDDDDDD0",
  "0D000000000000D0",
  "0D0rrbbggrrbb0D0",
  "0D0rrbbggrrbb0D0",
  "0D0rrbbggrrbb0D0",
  "0D000000000000D0",
  "0DDDDDDDDDDDDDD0",
  "0D000000000000D0",
  "0D0bbrrpprrgg0D0",
  "0D0bbrrpprrgg0D0",
  "0D0bbrrpprrgg0D0",
  "0D000000000000D0",
  "0DDDDDDDDDDDDDD0",
  "0D000000000000D0",
  "0D0ggrrbboorr0D0",
  "0D0ggrrbboorr0D0",
  "0D0ggrrbboorr0D0",
  "0D000000000000D0",
  "0DDDDDDDDDDDDDD0",
  "0000000000000000",
];

export const PLANT = [
  ".....0000.......",
  "...00GGGG00.....",
  "..0GGGGGGGG0....",
  ".0GGGhGGGGGG0...",
  ".0GGGGGGhGGG0...",
  ".0GhGGGGGGGG0...",
  ".0GGGGGGGGhG0...",
  "..0GGGGGGGG0....",
  "...00GGGG00.....",
  ".....0gg0.......",
  ".....0gg0.......",
  "....000000......",
  "...0rrrrrr0.....",
  "...0rRRrrr0.....",
  "...0rrrrrr0.....",
  "....0rrrr0......",
  ".....0000.......",
];

export const CHAIR = [
  "..00000000......",
  "..0dddddd0......",
  "..0dddddd0......",
  "..00000000......",
  "..0DDDDDD0......",
  "..0DDDDDD0......",
  "..0DDDDDD0......",
  "..00000000......",
  "..0D0..0D0......",
  "..0D0..0D0......",
  "..000..000......",
];

export const CAT = [
  "..0..........0..",
  ".0k0........0k0.",
  ".0kk00000000kk0.",
  ".0kkkkkkkkkkkk0.",
  ".0kWkkkkkkkWkk0.",
  ".0kkkkkkkkkkkk0.",
  "..0kkkkkkkkkk0..",
  "...0kkkkkkkk0...",
  "....00000000....",
];

export const WINDOW = [
  "0000000000000000",
  "0DDDDDDDDDDDDDD0",
  "0D000000000000D0",
  "0D0BBBB00BBBB0D0",
  "0D0BBBB00BBBB0D0",
  "0D0BBBB00BBBB0D0",
  "0D000000000000D0",
  "0D0BBBB00BBBB0D0",
  "0D0BBBB00BBBB0D0",
  "0D0BBBB00BBBB0D0",
  "0D000000000000D0",
  "0DDDDDDDDDDDDDD0",
  "0000000000000000",
];

export const CLOCK = [
  "....000000......",
  "..00wwwwww00....",
  ".0wwwwwwwwww0...",
  ".0www0wwwwww0...",
  ".0www0wwwwww0...",
  ".0www00000ww0...",
  ".0wwwwwwwwww0...",
  "..00wwwwww00....",
  "....000000......",
];

/* ── characters ────────────────────────────────────────────────────────── */

const FACE_DOWN = [
  "....0000....",
  "...0HHHH0...",
  "..0HHHHHH0..",
  "..0HSSSSH0..",
  "..0SSSSSS0..",
  "..0S0SS0S0..",
  "..0SSSSSS0..",
  "...0SSSS0...",
  "..0TTTTTT0..",
  ".0TTTTTTTT0.",
  ".0STTTTTTS0.",
  ".0STTTTTTS0.",
  "..0PPPPPP0..",
  "..0PP00PP0..",
  "..0OO..OO0..",
];

const FACE_UP = [
  "....0000....",
  "...0HHHH0...",
  "..0HHHHHH0..",
  "..0HHHHHH0..",
  "..0HHHHHH0..",
  "..0HHHHHH0..",
  "..0HHHHHH0..",
  "...0HHHH0...",
  "..0TTTTTT0..",
  ".0TTTTTTTT0.",
  ".0STTTTTTS0.",
  ".0STTTTTTS0.",
  "..0PPPPPP0..",
  "..0PP00PP0..",
  "..0OO..OO0..",
];

const FACE_SIDE = [
  "...0000.....",
  "..0HHHH0....",
  ".0HHHHHH0...",
  ".0HHHSSS0...",
  ".0HSSSSS0...",
  ".0HSS0SS0...",
  ".0HSSSSS0...",
  "..0SSSS0....",
  "..0TTTTT0...",
  "..0TTTTTT0..",
  "..0TTTTTTS0.",
  "..0TTTTT0...",
  "..0PPPPP0...",
  "..0PPPPP0...",
  "..0OOOO0....",
];

/** Facing index → base sprite. 1 (left) is 3 (right) flipped at draw time. */
export const FACINGS = [FACE_DOWN, FACE_SIDE, FACE_UP, FACE_SIDE];
export const FLIP_FACING = 1; // facing 1 draws the side sprite mirrored

/**
 * Walk frames, derived rather than authored: lift one foot, then the other,
 * and bob the body a pixel. Three hand-drawn poses become a full walk cycle
 * for every direction, which is the difference between ~45 lines of art and
 * ~400.
 */
export function walkCycle(base) {
  const legsFrom = base.length - 3;
  const lift = (side) =>
    base.map((row, y) => {
      if (y < legsFrom) return row;
      const half = Math.ceil(row.length / 2);
      const [l, r] = [row.slice(0, half), row.slice(half)];
      const blank = ".".repeat(half);
      // Raising a foot = shifting that half of the legs up one row.
      if (side === "l") return (y === base.length - 1 ? blank : base[y + 1].slice(0, half)) + r;
      return l + (y === base.length - 1 ? blank.slice(0, row.length - half) : base[y + 1].slice(half));
    });
  return [base, lift("l"), base, lift("r")];
}

/* ── per-person colours ────────────────────────────────────────────────────
   Picked from curated ramps rather than random hues: a hash into a good set
   always looks deliberate, where a random hue regularly does not. */

const SKIN = ["#f0c49a", "#e0a878", "#c98a5e", "#a66a43", "#7d4b2d", "#5c3620"];
const HAIR = ["#2b1d14", "#5a3a22", "#8a5a2a", "#c9933f", "#d9d2c4", "#8d3b2f", "#3b4a6b", "#6b3b6b"];
const SHIRT = ["#b8463c", "#3e6ea8", "#4a8a50", "#8b5e9c", "#cf8a45", "#3f8f8a", "#9c4068", "#5a6b8c"];
const TROUSER = ["#3a4252", "#4a3b2f", "#2f4138", "#53414d", "#2d3a4a"];
const SHOE = ["#2a2018", "#3c2a1c", "#1f2630"];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic from the member id, so you look the same to everyone. */
export function paletteFor(id) {
  const h = hash(String(id));
  return {
    S: SKIN[h % SKIN.length],
    H: HAIR[(h >>> 3) % HAIR.length],
    T: SHIRT[(h >>> 7) % SHIRT.length],
    P: TROUSER[(h >>> 11) % TROUSER.length],
    O: SHOE[(h >>> 15) % SHOE.length],
  };
}

/* ── drawing ───────────────────────────────────────────────────────────── */

/**
 * Blit a character-grid sprite. `tint` overrides palette entries per draw,
 * which is how one character sprite becomes everyone in the room.
 */
export function blit(ctx, sprite, x, y, tint = null, flip = false) {
  const w = sprite[0].length;
  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === ".") continue;
      const color = (tint && tint[ch]) || PAL[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + (flip ? w - 1 - col : col), y + row, 1, 1);
    }
  }
}

export function spriteSize(sprite) {
  return { w: sprite[0].length, h: sprite.length };
}
