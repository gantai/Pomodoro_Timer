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

  // laminate (the sit-stand desktop, so it reads apart from the wooden ones)
  l: "#e6e8ec",
  m: "#c8ccd4",

  // upholstery
  c: "#3f4654",
  v: "#5a6474",
  // tan leather — warmer and lighter than the wood, so the two don't blur
  u: "#8a5530",
  U: "#a9703f",
  V: "#c28a52",
  X: "#dcab74",

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

/**
 * An electric sit-stand desk. Same footprint as the plain desk so the two
 * interchange on the grid, but a pale laminate top on a steel frame instead of
 * wood, two column feet rather than four legs, and the thing that actually
 * says "electric": the little keypad with its lit display under the front
 * edge. At this scale height can't be drawn, so the frame and the keypad have
 * to carry it.
 */
export const STANDDESK = [
  "................................",
  "..........00000000..............",
  ".........0SSSSSSSS0.............",
  ".........0SbbbbbbS0.............",
  ".........0SbbbbbbS0.............",
  ".........0SSSSSSSS0.............",
  "..........0ssssss0..............",
  "...........0ssss0...............",
  "00000000000000000000000000000000",
  "0llllllllllllllllllllllllllllll0",
  "0llwwwllllllllllllllllll0yy0lll0",
  "0llwwwllllllllllllllllll0YY0lll0",
  "0lllllllllllllllllllllll000llll0",
  "0llllllllllllllllllllllllllllll0",
  "0mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm0",
  "00000000000000000000000000000000",
  "..0SSSS0.........0SSSS0.000000..",
  "..0ssss0.........0ssss0.0kYYk0..",
  "..000000.........000000.0kkkk0..",
  "........................000000..",
];

/**
 * A desktop monitor. It replaces the sit-stand stool, which everybody read
 * as a monitor anyway — a dark saddle on a silver column is exactly what a
 * screen on a stand looks like from above, and arguing with that was going
 * to lose. Rooms that already hold a stool get a monitor in its place.
 */
export const MONITOR = [
  "00000000000000000000",
  "0SSSSSSSSSSSSSSSSSS0",
  "0S0000000000000000S0",
  "0S0bbbbbbbbbbbbbb0S0",
  "0S0bbbbbbbbbbbbbb0S0",
  "0S0bBBBBBBBBBBBbb0S0",
  "0S0bbbbbbbbbbbbbb0S0",
  "0S0bbbbbbbbbbbbbb0S0",
  "0S0000000000000000S0",
  "0SSSSSSSSSSSSSSSSSS0",
  "00000000SSSS00000000",
  ".......0SSSS0.......",
  ".......0SSSS0.......",
  "...0SSSSSSSSSSSS0...",
  "...0ssssssssssss0...",
  "...00000000000000...",
];

/** A rubber, for the doodle wall's eraser button. */
export const ERASER = [
  "...0000.....",
  "..0WWWW00...",
  ".0WWWWWW00..",
  "0WWWWWWWWW0.",
  "0RRRRRRRRRR0",
  "0RRRRRRRRRR0",
  "0rrrrrrrrrr0",
  ".0rrrrrrrr0.",
  "..00000000..",
];

/**
 * A two-seat sofa, in brown fabric.
 *
 * Shape does most of the work: drawn as a closed rectangle it reads as a
 * sideboard however it is coloured, so this one is open at the front with the
 * arms running forward past the cushions. The rest is softness. Every corner
 * is clipped — square corners are what made earlier drafts look like joinery
 * — and each cushion is piped in a darker shade of its own colour rather than
 * boxed in black. The back is shallow and the seat deep, because from above
 * the seat is most of what you see. A throw pillow, because nothing says sofa
 * like something left on one. Its own browns rather than the wood palette, or
 * it would blur into the desks.
 *
 * Drawn as shapes rather than typed out row by row: rounded corners and a
 * derived outline are miserable to maintain as text, and the generator is in
 * the commit if it needs redrawing.
 */
export const SOFA = [
  "..0000000000000000000000000000000000000000000000..",
  ".0UUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU0.",
  "0UXXUUUuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuUUUXXU0",
  "0XXXXUuXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXuUXXXX0",
  "0VXXVUuVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVuUVXXV0",
  "0VVVVUuVVVuVVVVuVVVVuVVVVuVVVVuVVVVuVVVVuVVuUVVVV0",
  "0VVVVUuuVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVuuUVVVV0",
  "0VVVVUUuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuUUVVVV0",
  "0VVVVUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUVVVV0",
  "0VVVVUuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuUVVVV0",
  "0VVVVUuXXXXXXXXXXXuXXXXXXXXXXXXuXXXXXXXXXXXuUVVVV0",
  "0VVVVUuXXXXXXXXXXXuXXXXXXXXXXXXuXXXXXXXXXXXuUVVVV0",
  "0VVVVUuXXXXXXXXXXXuXXXXXXXXXXXXuXXXXXXXXXXXuUVVVV0",
  "0VVVVUuXXXXXXXXXXXuXXXXXXXXXXXXuXXXXXXXXXXXuUVVVV0",
  "0VVVVUuXXXXXXXXXXXuXXXXXXXXXXXXuXXXXXXXXXXXuUVVVV0",
  "0VVVVUuVVVVVVVVVVVuVVVVVVVVVVVVuVVVVVVVVVVVuUVVVV0",
  ".0VVUUuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuUUVV0.",
  "..0UU0000000000000000000000000000000000000000UU0..",
  ".0UU0........................................0UU0.",
  "0UUUU0......................................0UUUU0",
  ".0000........................................0000.",
  ".eee..........................................eee.",
  ".eee..........................................eee.",
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

/* ── animal avatars ────────────────────────────────────────────────────────
   One pose each, facing the viewer. People get three facings because a human
   walking away looks wrong otherwise; a cat that always faces you reads as
   charm rather than error, which buys back two thirds of the art.

   A = body, B = belly, C = accent, e = eye, W = white. A/B/C come from the
   species tint, so the same blit path draws all of them. */

const A_CAT = [
  "..0........0..",
  ".0A0......0A0.",
  ".0ACA0..0ACA0.",
  ".0AAAA00AAAA0.",
  "0AAAAAAAAAAAA0",
  "0AAAAAAAAAAAA0",
  "0AeAAAAAAAAeA0",
  "0AAAAACCAAAAA0",
  "0AAAAAAAAAAAA0",
  ".0AAAAAAAAAA0.",
  ".0ABBBBBBBBA0.",
  ".0AABBBBBBAA0.",
  "..0AA0..0AA0..",
  "...00....00...",
];

const A_DOG = [
  "...0....0.....",
  "..0CC0.0CC0...",
  ".0CCCC0CCCC0..",
  ".0CCCAAAACCC0.",
  "0CCAAAAAAAACC0",
  "0CCAAAAAAAACC0",
  "0CCAeAAAAeACC0",
  "0CCAAACCAAACC0",
  "0CCAAAAAAAACC0",
  ".0CAAAAAAAAC0.",
  ".0ABBBBBBBBA0.",
  ".0AABBBBBBAA0.",
  "..0AA0..0AA0..",
  "...00....00...",
];

const A_FOX = [
  "..0........0..",
  ".0C0......0C0.",
  ".0CC0....0CC0.",
  ".0CAA0..0AAC0.",
  "0AAAAAAAAAAAA0",
  "0AAAAAAAAAAAA0",
  "0BeAAAAAAAAeB0",
  "0BAAAACCAAAAB0",
  "0BBAAAAAAAABB0",
  ".0BBBBBBBBBB0.",
  ".0ABBBBBBBBA0.",
  ".0AABBBBBBAA0.",
  "..0AA0..0AA0..",
  "...00....00...",
];

const A_BUNNY = [
  "...0CC0..0CC0.",
  "...0CC0..0CC0.",
  "...0AA0..0AA0.",
  "..0AAAAAAAAA0.",
  "0AAAAAAAAAAAA0",
  "0AAAAAAAAAAAA0",
  "0AeAAAAAAAAeA0",
  "0AAAAACCAAAAA0",
  "0AAAAAAAAAAAA0",
  ".0AAAAAAAAAA0.",
  ".0ABBBBBBBBA0.",
  ".0AABBBBBBAA0.",
  "..0AA0..0AA0..",
  "...00....00...",
];

const A_BEAR = [
  ".0CC0....0CC0.",
  "0CAAC0..0CAAC0",
  ".0AAAAAAAAAA0.",
  "0AAAAAAAAAAAA0",
  "0AAAAAAAAAAAA0",
  "0AAAAAAAAAAAA0",
  "0AeAAAAAAAAeA0",
  "0AAAABBBBAAAA0",
  "0AAAABCCBAAAA0",
  ".0AAAABBAAAA0.",
  ".0ABBBBBBBBA0.",
  ".0AABBBBBBAA0.",
  "..0AA0..0AA0..",
  "...00....00...",
];

const A_FROG = [
  "..00......00..",
  ".0AA0....0AA0.",
  ".0AeA0..0AeA0.",
  ".0AAAA00AAAA0.",
  "0AAAAAAAAAAAA0",
  "0AAAAAAAAAAAA0",
  "0AAAAAAAAAAAA0",
  "0ABBBBBBBBBBA0",
  "0A0000000000A0",
  ".0AAAAAAAAAA0.",
  ".0ABBBBBBBBA0.",
  ".0AABBBBBBAA0.",
  "..0AA0..0AA0..",
  "...00....00...",
];

const A_OWL = [
  ".0C0......0C0.",
  ".0CC0....0CC0.",
  "..0AAAAAAAA0..",
  ".0AAAAAAAAAA0.",
  "0AAWWAAAAWWAA0",
  "0AAWeAAAAeWAA0",
  "0AAWWAAAAWWAA0",
  "0AAAAACCAAAAA0",
  "0AABBBBBBBBAA0",
  ".0ABBBBBBBBA0.",
  ".0ABBBBBBBBA0.",
  ".0AABBBBBBAA0.",
  "..0CC0..0CC0..",
  "...00....00...",
];

const A_PENGUIN = [
  "....000000....",
  "..00AAAAAA00..",
  ".0AAAAAAAAAA0.",
  "0AAAeAAAAeAAA0",
  "0AAAAACCAAAAA0",
  "0AAAAACCAAAAA0",
  "0AABBBBBBBBAA0",
  "0ABBBBBBBBBBA0",
  "0ABBBBBBBBBBA0",
  "0ABBBBBBBBBBA0",
  ".0ABBBBBBBBA0.",
  ".0AABBBBBBAA0.",
  "..0CC0..0CC0..",
  "...00....00...",
];

/** The roster. `person` keeps the original human, coloured per member. */
export const ICONS = [
  { id: "person", label: "Person", sprite: null, tint: null },
  { id: "cat", label: "Cat", sprite: A_CAT, tint: { A: "#6e6e78", B: "#d8d2c8", C: "#e0929a" } },
  { id: "dog", label: "Dog", sprite: A_DOG, tint: { A: "#c9914f", B: "#efe2cc", C: "#8a5a33" } },
  { id: "fox", label: "Fox", sprite: A_FOX, tint: { A: "#d2763a", B: "#f2eadb", C: "#b8552a" } },
  { id: "bunny", label: "Bunny", sprite: A_BUNNY, tint: { A: "#e4ded4", B: "#fbf8f2", C: "#e0a0a8" } },
  { id: "bear", label: "Bear", sprite: A_BEAR, tint: { A: "#8a5a3a", B: "#c9a37a", C: "#6b452c" } },
  { id: "frog", label: "Frog", sprite: A_FROG, tint: { A: "#5aa05a", B: "#cfe6b8", C: "#3f7a46" } },
  { id: "owl", label: "Owl", sprite: A_OWL, tint: { A: "#a6845c", B: "#e4d3b4", C: "#7a5f40" } },
  { id: "penguin", label: "Penguin", sprite: A_PENGUIN, tint: { A: "#343a48", B: "#f1ead9", C: "#e0a23a" } },
];

export const ICON_IDS = ICONS.map((i) => i.id);
const BY_ID = new Map(ICONS.map((i) => [i.id, i]));
export const iconById = (id) => BY_ID.get(id) || BY_ID.get("person");

/* ── the furniture catalogue ───────────────────────────────────────────────
   What can be placed in a room. Ids are short because they travel in the
   room's saved layout; the server validates against this same list. */

/** The rug is painted rather than drawn as a grid — 128x40 of text is silly. */
export function paintRug(ctx, x, y) {
  const w = 128;
  const h = 40;
  ctx.fillStyle = PAL["0"];
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = PAL.r;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = PAL.o;
  ctx.fillRect(x + 4, y + 3, w - 8, h - 6);
  ctx.fillStyle = PAL.r;
  ctx.fillRect(x + 6, y + 5, w - 12, h - 10);
  ctx.fillStyle = PAL.o;
  for (let i = x + 10; i < x + w - 10; i += 8) ctx.fillRect(i, y + h / 2 - 2, 4, 4);
  ctx.fillStyle = PAL.n;
  for (let i = x + 2; i < x + w - 2; i += 4) {
    ctx.fillRect(i, y - 2, 2, 2);
    ctx.fillRect(i, y + h, 2, 2);
  }
}

export const CATALOGUE = {
  desk: { label: "Desk", art: DESK },
  chair: { label: "Chair", art: CHAIR },
  sofa: { label: "Sofa", art: SOFA },
  standdesk: { label: "Sit-stand desk", art: STANDDESK },
  monitor: { label: "Monitor", art: MONITOR },
  shelf: { label: "Shelf", art: SHELF },
  plant: { label: "Plant", art: PLANT },
  window: { label: "Window", art: WINDOW },
  clock: { label: "Clock", art: CLOCK },
  cat: { label: "Cat", art: CAT },
  rug: { label: "Rug", paint: paintRug, w: 128, h: 40 },
};

export const ITEM_IDS = Object.keys(CATALOGUE);

export function itemSize(id) {
  const item = CATALOGUE[id];
  if (!item) return { w: 0, h: 0 };
  return item.art ? spriteSize(item.art) : { w: item.w, h: item.h };
}

/** Paint one catalogue item at a position, sprite or painter alike. */
export function paintItem(ctx, id, x, y) {
  const item = CATALOGUE[id];
  if (!item) return;
  if (item.art) blit(ctx, item.art, x, y);
  else item.paint(ctx, x, y);
}

/** The room everyone starts with, and what "reset" restores. */
export const DEFAULT_LAYOUT = [
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
  { i: "chair", x: 64, y: 122 },
  { i: "chair", x: 240, y: 122 },
  { i: "plant", x: 16, y: 146 },
  { i: "plant", x: 278, y: 146 },
  { i: "shelf", x: 0, y: 160 },
  { i: "shelf", x: 288, y: 160 },
  { i: "sofa", x: 135, y: 156 },
  { i: "cat", x: 148, y: 128 },
];

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

/**
 * Render a sprite to a data URL, for the icon picker and the rail list.
 * Memoised: the same handful of icons are asked for on every repaint.
 */
const urlCache = new Map();
export function iconDataURL(iconId, memberId = "", scale = 3) {
  const key = `${iconId}|${memberId}|${scale}`;
  const hit = urlCache.get(key);
  if (hit) return hit;

  const icon = iconById(iconId);
  const sprite = icon.sprite || FACE_DOWN;
  const tint = icon.tint || paletteFor(memberId || iconId);
  const { w, h } = spriteSize(sprite);

  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);
  blit(ctx, sprite, 0, 0, tint);

  const url = c.toDataURL();
  urlCache.set(key, url);
  return url;
}
