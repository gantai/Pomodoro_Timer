/**
 * Unit test for the 30-day room sweep. Runs the RoomIndex alarm against a
 * stub storage layer, so the expiry decision can be checked at arbitrary ages
 * without waiting a month. Run with `npm run test:expiry` (no dev server
 * needed).
 */
import { RoomIndex } from "../src/roomIndex.js";

const DAY = 24 * 60 * 60 * 1000;
const fail = [];
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail.push(name);
}

function makeCtx(entries) {
  const map = new Map(Object.entries(entries));
  let alarm = null;
  return {
    alarmAt: () => alarm,
    keys: () => [...map.keys()],
    storage: {
      async put(k, v) { map.set(k, v); },
      async delete(k) { return map.delete(k); },
      async getAlarm() { return alarm; },
      async setAlarm(t) { alarm = t; },
      async list({ prefix, limit }) {
        const out = new Map();
        for (const [k, v] of map) {
          if (k.startsWith(prefix) && out.size < limit) out.set(k, v);
        }
        return out;
      },
    },
  };
}

function makeEnv(expired) {
  return {
    ROOM: {
      idFromName: (n) => n,
      get: (n) => ({
        fetch: async (url, init) => {
          if (new URL(url).pathname === "/expire" && init?.method === "POST") expired.push(n);
          return new Response("expired");
        },
      }),
    },
  };
}

const now = Date.now();

// ---- a fresh room, a room just under the limit, and two stale ones ----
{
  const ctx = makeCtx({
    "room:daily-standup": now - 2 * DAY,
    "room:almost-stale": now - 29.5 * DAY,
    "room:long-gone": now - 31 * DAY,
    "room:ancient": now - 400 * DAY,
  });
  const expired = [];
  const idx = new RoomIndex(ctx, makeEnv(expired));
  await idx.alarm();

  check("stale rooms are expired", expired.sort().join(",") === "ancient,long-gone", expired.join(","));
  check("active room survives", ctx.keys().includes("room:daily-standup"));
  check("room at 29.5 days survives", ctx.keys().includes("room:almost-stale"));
  check("stale entries removed from index", !ctx.keys().some((k) => k === "room:long-gone" || k === "room:ancient"));
  check("re-arms the next sweep", ctx.alarmAt() > now, String(ctx.alarmAt() - now));
  check("next sweep is ~24h out", Math.abs(ctx.alarmAt() - now - DAY) < 5000);
}

// ---- touching a room records it and arms the sweep ----
{
  const ctx = makeCtx({});
  const idx = new RoomIndex(ctx, makeEnv([]));
  await idx.fetch(new Request("https://index/touch", { method: "POST", body: JSON.stringify({ id: "daily-standup" }) }));
  check("touch records the room", ctx.keys().includes("room:daily-standup"));
  check("touch arms the sweep", ctx.alarmAt() !== null);

  const armed = ctx.alarmAt();
  await idx.fetch(new Request("https://index/touch", { method: "POST", body: JSON.stringify({ id: "daily-standup" }) }));
  check("second touch does not re-arm", ctx.alarmAt() === armed);
}

// ---- junk ids are ignored ----
{
  const ctx = makeCtx({});
  const idx = new RoomIndex(ctx, makeEnv([]));
  for (const id of ["", "ab", "../etc/passwd", "Room With Spaces", null, "x".repeat(60)]) {
    await idx.fetch(new Request("https://index/touch", { method: "POST", body: JSON.stringify({ id }) }));
  }
  check("malformed room ids are not indexed", ctx.keys().length === 0, ctx.keys().join(","));
}

// ---- nothing to do is not an error ----
{
  const ctx = makeCtx({});
  const idx = new RoomIndex(ctx, makeEnv([]));
  await idx.alarm();
  check("empty index sweeps cleanly and re-arms", ctx.alarmAt() > now);
}

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join(", ")}` : "\nAll checks passed.");
process.exit(fail.length ? 1 : 0);
