/**
 * Generator for the café and gym furniture in public/pixel/art.js:
 * VENDING, COUNTER, CAFETABLE, COFFEE, TREADMILL, DUMBBELLS.
 *
 *   node tools/draw-corners.mjs
 *
 * Drawn as shapes, like the sofa: clipped corners and derived outlines are
 * miserable to keep as literal rows. Paste the output over the arrays.
 */

function grid(W, H) { return Array.from({ length: H }, () => Array(W).fill(".")); }
function maker(g, W, H) {
  return (x0, y0, x1, y1, ch, round = 0) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (round && Math.min(x - x0, x1 - x) + Math.min(y - y0, y1 - y) < round) continue;
      g[y][x] = ch;
    }
  };
}
function outline(g, W, H) {
  const solid = g.map((r) => r.map((c) => c !== "."));
  const on = (x, y) => (x >= 0 && x < W && y >= 0 && y < H ? solid[y][x] : false);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (solid[y][x] && !(on(x + 1, y) && on(x - 1, y) && on(x, y + 1) && on(x, y - 1))) g[y][x] = "0";
}
const emit = (name, g) => {
  const rows = g.map((r) => r.join(""));
  while (rows.length && !rows[rows.length - 1].replace(/\./g, "")) rows.pop();
  return `export const ${name} = [\n` + rows.map((r) => `  "${r}",\n`).join("") + "];\n";
};

/* ── vending machine ───────────────────────────────────────────────────
   Seen the way the shelves and windows are: a tall front, not a lid. Glass
   with three shelves of snacks, a keypad down one side, a flap at the foot. */
{
  const W = 24, H = 30, g = grid(W, H), f = maker(g, W, H);
  f(0, 0, W - 1, H - 3, "s", 2);              // body
  f(1, 1, W - 2, 2, "S");                     // lit top edge
  outline(g, W, H);
  f(2, 4, 15, 22, "0");                       // glass frame
  f(3, 5, 14, 21, "B");                       // glass
  const snack = ["r", "y", "G", "o", "b", "R"];
  let n = 0;
  for (const row of [6, 11, 16]) {
    for (let x = 4; x <= 12; x += 3) { f(x, row, x + 1, row + 3, snack[n++ % snack.length]); }
    f(3, row + 4, 14, row + 4, "s");          // the shelf they sit on
  }
  f(17, 5, 21, 6, "k");                       // coin slot
  for (let y = 8; y <= 16; y += 3) for (let x = 17; x <= 21; x += 2) f(x, y, x + 1, y + 1, "S");
  f(17, 19, 21, 21, "k");                     // a small screen
  f(18, 20, 20, 20, "G");
  f(2, 24, 21, 27, "k", 1);                   // collection flap
  f(3, 25, 20, 26, "0");
  console.log(emit("VENDING", g));
}


/* ── counter ───────────────────────────────────────────────────────── */
{
  const W = 44, H = 18, g = grid(W, H), f = maker(g, W, H);
  f(0, 0, W - 1, 15, "d", 1);
  outline(g, W, H);
  f(1, 1, W - 2, 4, "f");                     // worktop, catching the light
  f(1, 1, W - 2, 1, "n");
  for (const x0 of [3, 16, 29]) {             // three cupboard doors
    f(x0, 7, x0 + 10, 13, "0");
    f(x0 + 1, 8, x0 + 9, 12, "D");
    f(x0 + 4, 10, x0 + 6, 10, "y");           // handle
  }
  f(2, 16, 5, 17, "e");                       // feet
  f(W - 6, 16, W - 3, 17, "e");
  console.log(emit("COUNTER", g));
}

/* ── café table ────────────────────────────────────────────────────── */
{
  const W = 22, H = 22, g = grid(W, H), f = maker(g, W, H);
  f(0, 0, 21, 13, "D", 5);                    // round top
  outline(g, W, H);
  f(2, 2, 19, 11, "f", 4);                    // lit surface
  f(9, 14, 12, 17, "e");                      // pedestal
  f(5, 18, 16, 20, "e", 1);                   // foot
  outline(g, W, H);
  f(6, 4, 9, 7, "W");                         // a cup left on it
  f(7, 5, 8, 6, "n");
  console.log(emit("CAFETABLE", g));
}

/* ── coffee machine, from the photo ──────────────────────────────────
   Black body, a lid with a lighter top, a row of four round controls across
   the face, chrome group head with the portafilter handle sticking out to
   the right, two glass cups on a slotted drip tray, steam wand on the side. */
{
  const W = 24, H = 24, g = grid(W, H), f = maker(g, W, H);
  f(3, 0, 18, 20, "k", 2);                    // the body — black, tall
  f(4, 0, 17, 1, "s");                        // lid, lighter, where the cup warmer is
  outline(g, W, H);
  for (const x of [5, 8, 11, 14]) {           // four controls, chrome
    f(x, 4, x + 1, 5, "S");
  }
  f(6, 8, 15, 10, "0");                       // group head housing
  f(7, 8, 14, 9, "S");
  f(9, 11, 12, 12, "S");                      // portafilter body
  f(13, 11, 20, 11, "S");                     // its handle, out to the right
  f(13, 12, 20, 12, "s");
  f(6, 14, 8, 17, "B");                       // two glass cups, espresso in them
  f(6, 16, 8, 17, "e");
  f(10, 14, 12, 17, "B");
  f(10, 16, 12, 17, "e");
  f(3, 18, 18, 20, "s");                      // drip tray
  for (let x = 5; x <= 16; x += 2) f(x, 19, x, 19, "0");   // its slots
  f(19, 6, 20, 7, "S");                       // steam wand, off the right side
  f(20, 8, 20, 15, "S");
  f(19, 16, 21, 16, "S");
  outline(g, W, H);
  f(4, 2, 17, 2, "s");                        // keep the lid's lit edge after outlining
  console.log(emit("COFFEE", g));
}

/* ── treadmill ───────────────────────────────────────────────────────
   Seen from above: a long belt with a console at the head end and side
   rails. The belt is dark with faint tread lines so it reads as rubber. */
{
  const W = 20, H = 40, g = grid(W, H), f = maker(g, W, H);
  f(1, 8, 18, 38, "s", 1);                    // deck
  outline(g, W, H);
  f(3, 10, 16, 36, "k");                      // belt
  for (let y = 12; y <= 35; y += 3) f(4, y, 15, y, "0");   // tread lines
  f(0, 9, 1, 30, "S");                        // side rails
  f(18, 9, 19, 30, "S");
  f(2, 0, 17, 7, "s", 1);                     // console
  outline(g, W, H);
  f(4, 1, 15, 4, "k");                        // screen
  f(5, 2, 14, 3, "G");
  for (const x of [5, 8, 11, 14]) f(x, 6, x, 6, "0");   // buttons
  f(0, 9, 1, 30, "S");                        // rails again, over the outline
  f(18, 9, 19, 30, "S");
  console.log(emit("TREADMILL", g));
}

/* ── dumbbell rack ───────────────────────────────────────────────────
   A short two-tier rack with three pairs of dumbbells, heads in dark iron,
   handles in chrome. Compact, so it sits against a wall. */
{
  const W = 32, H = 18, g = grid(W, H), f = maker(g, W, H);
  f(0, 0, 31, 15, "s", 1);                    // frame
  outline(g, W, H);
  for (const [tier, y] of [[0, 2], [1, 9]]) {
    f(1, y + 4, 30, y + 4, "0");              // the shelf lip
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 10;
      f(x, y, x + 1, y + 3, "k");             // left head
      f(x + 6, y, x + 7, y + 3, "k");         // right head
      f(x + 2, y + 1, x + 5, y + 2, "S");     // handle
    }
  }
  f(1, 16, 3, 17, "0");                       // feet
  f(28, 16, 30, 17, "0");
  console.log(emit("DUMBBELLS", g));
}
