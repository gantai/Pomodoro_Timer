/**
 * Integration test for the shared timer. Start the dev server first
 * (`npm run dev`), then run `npm test`. `SLOW=1 npm test` additionally waits
 * out a real 60-second phase to exercise the storage alarm.
 */
const PORT = process.env.PORT || 8787;
// Fresh room each run — a Durable Object persists its state between runs.
const URL_ = `ws://127.0.0.1:${PORT}/api/room/test-${Math.random().toString(36).slice(2, 8)}`;
const log = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client(tag) {
  const ws = new WebSocket(URL_);
  const c = { tag, ws, last: null, msgs: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.msgs.push(m);
    if (m.type === "state" || m.type === "welcome") c.last = m;
  };
  return new Promise((res, rej) => {
    ws.onopen = () => res(c);
    ws.onerror = rej;
  });
}

const fail = [];
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail.push(name);
}

const a = await client("A");
const b = await client("B");
await wait(400);

check("both connect + get welcome", a.last && b.last);
check("A sees 2 members", a.last.members.length === 2, JSON.stringify(a.last.members));
check("default focus 25m", a.last.settings.focus === 25 && a.last.remaining === 25 * 60000);
check("starts paused", a.last.running === false);

// custom lengths
a.ws.send(JSON.stringify({ type: "settings", settings: { focus: 2, short: 1, long: 3, roundsBeforeLong: 2, autoStart: true, sound: true } }));
await wait(300);
check("B receives custom lengths", b.last.settings.focus === 2 && b.last.settings.roundsBeforeLong === 2);
check("idle remaining follows new length", b.last.remaining === 2 * 60000, String(b.last.remaining));

// clamping
a.ws.send(JSON.stringify({ type: "settings", settings: { focus: 9999, short: 0, long: -4, roundsBeforeLong: 99 } }));
await wait(300);
check("lengths clamped to 1..180", b.last.settings.focus === 180 && b.last.settings.short === 1 && b.last.settings.long === 1);

// back to a short test length
a.ws.send(JSON.stringify({ type: "settings", settings: { focus: 1, short: 1, long: 1, roundsBeforeLong: 2, autoStart: false } }));
await wait(200);

// start / pause
b.ws.send(JSON.stringify({ type: "start" }));
await wait(300);
check("start propagates to A", a.last.running === true && a.last.endsAt > Date.now());
const t1 = a.last.endsAt;
await wait(1200);
b.ws.send(JSON.stringify({ type: "pause" }));
await wait(300);
check("pause propagates", a.last.running === false && a.last.remaining < 60000 && a.last.remaining > 57000, String(a.last.remaining));
check("endsAt cleared on pause", a.last.endsAt === null);

// resume keeps remaining
const held = a.last.remaining;
a.ws.send(JSON.stringify({ type: "start" }));
await wait(250);
check("resume keeps remaining", Math.abs(a.last.endsAt - (Date.now() + held)) < 1500);

// reset
a.ws.send(JSON.stringify({ type: "reset" }));
await wait(250);
check("reset restores full phase", b.last.remaining === 60000 && b.last.running === false);

// skip cycles focus -> short -> focus -> long
check("phase is focus", a.last.phase === "focus");
a.ws.send(JSON.stringify({ type: "skip" }));
await wait(200);
check("skip 1 -> short break", a.last.phase === "short", a.last.phase);
a.ws.send(JSON.stringify({ type: "skip" }));
await wait(200);
check("skip 2 -> focus", a.last.phase === "focus", a.last.phase);
a.ws.send(JSON.stringify({ type: "skip" }));
await wait(200);
check("skip 3 -> long break (every 2 rounds)", a.last.phase === "long", a.last.phase);
a.ws.send(JSON.stringify({ type: "skip" }));
await wait(200);
check("skip 4 -> focus, cycle resets", a.last.phase === "focus" && a.last.round === 0);

// manual phase pick
b.ws.send(JSON.stringify({ type: "phase", phase: "long" }));
await wait(200);
check("manual phase select", a.last.phase === "long" && a.last.remaining === 60000);
b.ws.send(JSON.stringify({ type: "phase", phase: "bogus" }));
await wait(200);
check("bogus phase ignored", a.last.phase === "long");

// alarm-driven rollover with autoStart off: 1 min is too long, use settings trick
b.ws.send(JSON.stringify({ type: "phase", phase: "focus" }));
await wait(150);
b.ws.send(JSON.stringify({ type: "start" }));
await wait(200);
const before = a.last.completed;

// ping/pong
const echo = Date.now();
a.ws.send(JSON.stringify({ type: "ping", echo }));
await wait(250);
const pong = a.msgs.filter((m) => m.type === "pong").pop();
check("ping returns server clock", !!pong && pong.echo === echo && Math.abs(pong.serverTime - Date.now()) < 5000);

// activity log
check("activity log populated", a.last.log.length > 0, a.last.log[0]?.text);
check("log names guests", /Guest \d/.test(JSON.stringify(a.last.log)));

// presence on disconnect
b.ws.close();
await wait(500);
check("A sees B leave", a.last.members.length === 1, JSON.stringify(a.last.members));

// state survives a fresh join (server is authoritative)
const c = await client("C");
await wait(400);
check("late joiner inherits running timer", c.last.running === true && c.last.endsAt > Date.now());
check("late joiner inherits custom lengths", c.last.settings.focus === 1);

// alarm-driven phase rollover (1 minute is the shortest allowed phase)
if (process.env.SLOW) {
  a.ws.send(JSON.stringify({ type: "settings", settings: { focus: 1, autoStart: true } }));
  a.ws.send(JSON.stringify({ type: "reset" }));
  await wait(200);
  a.ws.send(JSON.stringify({ type: "start" }));
  await wait(200);
  const doneBefore = a.last.completed;
  console.log("  …waiting 63s for the alarm to fire");
  await wait(63_000);
  check("alarm rolls focus -> break", a.last.phase !== "focus", a.last.phase);
  check("completed round counted", a.last.completed === doneBefore + 1);
  check("autoStart ran the next phase", a.last.running === true);
  check("chime broadcast on rollover", a.msgs.some((m) => m.chime === "focus"));
}

a.ws.close();
c.ws.close();
await wait(200);
console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join(", ")}` : "\nAll checks passed.");
process.exit(fail.length ? 1 : 0);
