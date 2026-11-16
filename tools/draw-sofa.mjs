/**
 * Generator for the SOFA sprite in public/pixel/art.js.
 *
 *   node tools/draw-sofa.mjs
 *
 * Drawn from shapes rather than typed out row by row: it is all clipped
 * corners and a derived outline, and keeping that as literal text means
 * recounting every row below any change.
 *
 * Modelled on a tan leather chesterfield seen from directly above. What makes
 * that recognisable at this size, in rough order of importance:
 *
 *   · Clipped corners everywhere. Square corners read as joinery no matter
 *     how the thing is coloured — this is most of the difference between a
 *     sofa and a sideboard.
 *   · Three seat cushions. Two reads as a bench; three is a sofa. Flat
 *     panels with a seam between them, not three separately rounded shapes
 *     — rounding each one makes them bulge like bread rolls.
 *   · Slim arms. Chunky ones turn the silhouette back into a box.
 *   · A buttoned back. Even a single row of dimples says upholstery, and it
 *     is the one detail of a chesterfield that survives being shrunk.
 *   · Tan, lit from the top edge, darkening toward the front — leather has a
 *     sheen that matte fabric does not.
 */

const W = 50;
const H = 23;
const g = Array.from({ length: H }, () => Array(W).fill("."));

/** `round` clips that many pixels off each corner. */
function fill(x0, y0, x1, y1, ch, round = 0) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (round && Math.min(x - x0, x1 - x) + Math.min(y - y0, y1 - y) < round) continue;
      g[y][x] = ch;
    }
  }
}

// ── silhouette ────────────────────────────────────────────────────────────
// A back slab with the seat in front of it, and two slim arms running forward
// past the cushions so the front stays open. A closed rectangle is a cabinet.
fill(0, 0, W - 1, 17, "U", 2);
fill(0, 18, 5, 20, "U", 1);
fill(W - 6, 18, W - 1, 20, "U", 1);

// ── one-pixel outline, derived so the clipped corners keep theirs ─────────
const solid = g.map((r) => r.map((c) => c !== "."));
const on = (x, y) => (x >= 0 && x < W && y >= 0 && y < H ? solid[y][x] : false);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (solid[y][x] && !(on(x + 1, y) && on(x - 1, y) && on(x, y + 1) && on(x, y - 1))) g[y][x] = "0";
  }
}

// ── the back: one long buttoned panel, not cushions ──────────────────────
fill(6, 2, 43, 7, "u", 1);
fill(7, 3, 42, 6, "V", 1);
fill(7, 3, 42, 3, "X");                   // the top edge catches the light
for (let x = 10; x <= 40; x += 5) g[5][x] = "u";   // buttons, one pixel each

// ── the seating area ─────────────────────────────────────────────────────
// Flat panels divided by a single seam, the way the first pass drew them.
// Rounding each cushion separately made them bulge like three bread rolls;
// a chesterfield's seat is boxy, and crisp panels read better at this size.
fill(6, 9, 43, 16, "u");                  // piping around the whole seat
fill(7, 10, 42, 15, "X");                 // the cushions, flat and lit
fill(7, 15, 42, 15, "V");                 // a shade at the front edge only
for (const x of [18, 31]) fill(x, 10, x, 15, "u");   // and the two seams

// ── arms: a lit top edge, so they read as rolled rather than flat ────────
for (const x0 of [1, W - 5]) {
  fill(x0, 2, x0 + 3, 16, "V", 1);
  fill(x0, 2, x0 + 3, 4, "X", 1);
}

// ── tapered legs, just showing past the arms ─────────────────────────────
fill(1, 21, 3, 22, "e");
fill(W - 4, 21, W - 2, 22, "e");

const rows = g.map((r) => r.join(""));
while (rows.length && !rows[rows.length - 1].replace(/\./g, "")) rows.pop();
console.log("export const SOFA = [");
for (const r of rows) console.log(`  "${r}",`);
console.log("];");
