/* What a room keeps when everyone goes home.
 *
 * The empty-room reset clears the *run* — phase, round, clock. It must not
 * touch the things the room is for: the furniture, the message board and the
 * doodle wall. Those go only when the room is deleted or swept at 30 days.
 * Run against a server started with --var EMPTY_GRACE_MS:1200.
 */
const PORT = process.env.PORT || 8796;
const room = `lasting-${Date.now().toString(36)}`;
let pass = 0, fail = 0;
const ok = (c, m, d = "") => { c ? (pass++, console.log("  ✓ " + m + (d ? ` — ${d}` : ""))) : (fail++, console.log("  ✗ " + m + (d ? ` — ${d}` : ""))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/room/${room}?name=${name}&cid=${name}-${Math.random().toString(36).slice(2, 12)}`);
  ws.inbox = [];
  ws.onmessage = (e) => ws.inbox.push(JSON.parse(e.data));
  return new Promise((res, rej) => { ws.onopen = () => res(ws); ws.onerror = rej; });
}
const wait = (ws, type, ms = 3000) =>
  new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = setInterval(() => {
      const hit = ws.inbox.find((m) => m.type === type);
      if (hit) { clearInterval(tick); ws.inbox = ws.inbox.filter((m) => m !== hit); res(hit); }
      else if (Date.now() - t0 > ms) { clearInterval(tick); rej(new Error("no " + type)); }
    }, 25);
  });
const inked = (runs) => { let n = 0; for (let i = 0; i < runs.length; i += 2) if (runs[i] !== 0) n += runs[i + 1]; return n; };

console.log(`room ${room}`);
let a = await connect("Ann");
const w0 = await wait(a, "welcome");

// leave a mark of each kind
a.send(JSON.stringify({ type: "place", i: "standdesk", x: 40, y: 100 }));
await wait(a, "layout");
a.send(JSON.stringify({ type: "note", text: "See you tomorrow" }));
await wait(a, "note");
a.send(JSON.stringify({ type: "paint", cells: [[5, 5, 3], [6, 5, 3], [7, 5, 3]] }));
a.send(JSON.stringify({ type: "settings", settings: { ...w0.settings, focus: 42 } }));
await sleep(400);

// start the clock, then everyone goes home
a.send(JSON.stringify({ type: "start" }));
await sleep(300);
a.close();
await sleep(2200); // longer than the grace window

const b = await connect("Ben");
const w1 = await wait(b, "welcome");

ok(w1.running === false, "the run is reset: the clock is stopped");
ok(w1.phase === "focus", "the run is reset: back to the top of a focus phase");
ok(w1.settings.focus === 42, "the timer lengths are kept", `${w1.settings.focus}m`);
ok(w1.layout.some((o) => o.i === "standdesk" && o.x === 40), "the furniture is kept", `${w1.layout.length} items`);
ok(w1.notes.length === 1 && w1.notes[0].text === "See you tomorrow", "the message board is kept",
   JSON.stringify(w1.notes.map((n) => n.text)));
ok(inked(w1.wall) === 3, "the doodle wall is kept", `${inked(w1.wall)} cells`);

// and deleting really does take all of it
b.send(JSON.stringify({ type: "deleteRoom", confirm: room }));
await sleep(600);
const c = await connect("Cat");
const w2 = await wait(c, "welcome");
ok(w2.notes.length === 0, "deleting the room empties the board");
ok(inked(w2.wall) === 0, "deleting the room blanks the wall");
ok(!w2.layout.some((o) => o.i === "standdesk" && o.x === 40), "deleting the room restores the default furniture");
ok(w2.settings.focus === 25, "deleting the room forgets the timer lengths", `${w2.settings.focus}m`);
c.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
