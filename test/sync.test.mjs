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

/** A room of its own, for checks that depend on it being genuinely empty. */
function freshRoomUrl() {
  return `ws://127.0.0.1:${PORT}/api/room/test-${Math.random().toString(36).slice(2, 8)}`;
}

function client(tag, url = URL_) {
  const ws = new WebSocket(url);
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

// ---- a refresh must not lose the session ----
// Its own room: "everyone left" only means something if nobody else is in it.
const REFRESH_ROOM = freshRoomUrl();
{
  const d = await client("D", REFRESH_ROOM);
  await wait(400);
  d.ws.send(JSON.stringify({ type: "start" }));
  await wait(300);
  check("timer running before everyone leaves", d.last.running === true, String(d.last.running));
  const endsAt = d.last.endsAt;

  d.ws.close();
  await wait(700); // well inside the 60s grace window
  const back = await client("D2", REFRESH_ROOM);
  await wait(500);
  check("quick rejoin keeps the running timer", back.last.running === true, String(back.last.running));
  check("quick rejoin keeps the same deadline", Math.abs(back.last.endsAt - endsAt) < 50, `${back.last.endsAt - endsAt}ms drift`);
  check("quick rejoin is not announced as a reset", !JSON.stringify(back.last.log).includes("timer reset"));
  back.ws.close();
  await wait(300);
}

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

  // ---- past the grace window, the next arrival gets a fresh timer ----
  // Again in a room of its own, so closing E really does empty it.
  const EMPTY_ROOM = freshRoomUrl();
  const e = await client("E", EMPTY_ROOM);
  await wait(400);
  e.ws.send(JSON.stringify({ type: "settings", settings: { focus: 25, short: 5, long: 15, roundsBeforeLong: 4, autoStart: false } }));
  await wait(250);
  e.ws.send(JSON.stringify({ type: "phase", phase: "short" }));
  await wait(250);
  e.ws.send(JSON.stringify({ type: "start" }));
  await wait(400);
  check("set up mid-session state to abandon", e.last.running === true && e.last.phase === "short", `${e.last.phase} running=${e.last.running}`);

  e.ws.close();
  console.log("  …leaving the room empty for 65s");
  await wait(65_000);

  const f = await client("F", EMPTY_ROOM);
  await wait(600);
  check("empty room resets to a stopped timer", f.last.running === false, String(f.last.running));
  check("empty room resets to focus", f.last.phase === "focus", f.last.phase);
  check("empty room resets the round counter", f.last.round === 0, String(f.last.round));
  check("full phase length is back on the clock", f.last.remaining === 25 * 60_000, String(f.last.remaining));
  check("custom settings survive the reset", f.last.settings.focus === 25 && f.last.settings.roundsBeforeLong === 4);
  check("reset is explained in the activity log", JSON.stringify(f.last.log).includes("timer reset"), f.last.log[0]?.text);
  f.ws.close();
}

a.ws.close();
c.ws.close();
await wait(200);
console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join(", ")}` : "\nAll checks passed.");
process.exit(fail.length ? 1 : 0);
