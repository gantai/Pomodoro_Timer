/* The doodle wall: a shared pixel canvas, not a freehand stroke list.
 *
 * Strokes would grow without limit — a wall people scribble on for a month
 * would eventually be megabytes, and "it stays until the room is deleted"
 * would quietly stop being true. A fixed grid of cells cannot grow: the wall
 * costs the same whether it is blank or covered, which is what makes the
 * promise keepable. It also merges the way the furniture does — two people
 * drawing at once touch different cells and both edits land.
 *
 * The grid is exactly as wide as the pixel room and shares its scale, so the
 * wall sits beneath the room with pixels the same size — part of the same
 * world rather than a widget parked underneath.
 *
 * This module is served to the browser and also bundled into the Worker, so
 * the codec is written once and the two ends cannot drift apart.
 */

export const WALL_W = 320;
export const WALL_H = 72;
export const WALL_CELLS = WALL_W * WALL_H;

/** Index 0 is bare wall. The rest are the pens, in the order they're shown. */
export const WALL_PENS = [
  null,
  "#1b1511", // charcoal
  "#ffffff", // chalk
  "#c0453a", // red
  "#e4873c", // orange
  "#e8c54a", // yellow
  "#4a8a50", // green
  "#2f8f6d", // teal
  "#3a6ea8", // blue
  "#6fa0d8", // sky
  "#8b5e9c", // purple
  "#d9679a", // pink
  "#8a5a33", // brown
  "#b9b9c2", // grey
];

export const PEN_COUNT = WALL_PENS.length;

export function blankWall() {
  return new Uint8Array(WALL_CELLS);
}

/**
 * Run-length encode to a flat [colour, count, colour, count, …] array. Flat
 * rather than pairs because it halves the JSON: a blank wall is `[0,9216]`,
 * and a well-used one is still a few KB.
 */
export function encodeWall(cells) {
  const runs = [];
  let colour = cells[0];
  let n = 1;
  for (let i = 1; i < cells.length; i++) {
    if (cells[i] === colour && n < 1e9) {
      n++;
    } else {
      runs.push(colour, n);
      colour = cells[i];
      n = 1;
    }
  }
  runs.push(colour, n);
  return runs;
}

/** The inverse. Returns null for anything that isn't a wall, rather than a
 *  half-filled one — this decodes data that arrived over a socket. */
export function decodeWall(runs) {
  if (!Array.isArray(runs) || runs.length % 2 !== 0) return null;
  const cells = blankWall();
  let at = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const colour = runs[i];
    const n = runs[i + 1];
    if (!Number.isInteger(colour) || colour < 0 || colour >= PEN_COUNT) return null;
    if (!Number.isInteger(n) || n < 1 || at + n > WALL_CELLS) return null;
    if (colour !== 0) cells.fill(colour, at, at + n);
    at += n;
  }
  return at === WALL_CELLS ? cells : null;
}

export const wallIsBlank = (cells) => cells.every((c) => c === 0);
