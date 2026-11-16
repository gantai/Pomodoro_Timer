/**
 * Generator for the SOFA sprite in public/pixel/art.js.
 *
 * Most sprites here are typed out row by row, which is fine for a bookshelf.
 * The sofa is all rounded corners and a derived outline, and maintaining that
 * as literal text is miserable — one inserted pixel and every row below has
 * to be recounted. Drawing it as shapes keeps it editable: change a number,
 * re-run, paste the result over the SOFA array.
 *
 *   node tools/draw-sofa.mjs
 */

const W = 40;
const H = 23;
const g = Array.from({ length: H }, () => Array(W).fill("."));

/** `round` clips that many pixels off each corner, which is what makes
 *  upholstery look soft instead of like joinery. */
function fill(x0, y0, x1, y1, ch, round = 0) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (round && Math.min(x - x0, x1 - x) + Math.min(y - y0, y1 - y) < round) continue;
      g[y][x] = ch;
    }
  }
}

// The silhouette: a back slab with a seat in front of it, and two arms that
// run forward past the cushions. Open at the front — a closed rectangle reads
// as a sideboard no matter how it is coloured.
fill(0, 0, 39, 17, "U", 2);
fill(0, 18, 6, 21, "U", 1);
fill(33, 18, 39, 21, "U", 1);

// One-pixel outline, derived from the shape so the rounded corners keep theirs.
const solid = g.map((r) => r.map((c) => c !== "."));
const at = (x, y) => (x >= 0 && x < W && y >= 0 && y < H ? solid[y][x] : false);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (solid[y][x] && !(at(x + 1, y) && at(x - 1, y) && at(x, y + 1) && at(x, y - 1))) g[y][x] = "0";
  }
}

// Four cushions, each piped in a darker shade of its own colour rather than
// boxed in black. The back is shallow and the seat deep, because seen from
// above the seat is most of what there is.
for (const [x0, x1] of [[9, 19], [21, 31]]) {
  fill(x0, 2, x1, 6, "u", 1);
  fill(x0 + 1, 3, x1 - 1, 5, "V", 1);
  fill(x0, 8, x1, 16, "V", 2);
  fill(x0 + 1, 9, x1 - 1, 15, "X", 2);
}

// A throw pillow. Nothing says sofa like something left on one.
fill(11, 10, 16, 14, "o", 1);
fill(12, 11, 15, 13, "y", 1);

const rows = g.map((r) => r.join(""));
while (rows.length && !rows[rows.length - 1].replace(/\./g, "")) rows.pop();
console.log("export const SOFA = [");
for (const r of rows) console.log(`  "${r}",`);
console.log("];");
