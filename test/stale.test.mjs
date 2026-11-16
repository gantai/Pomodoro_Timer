/**
 * The backstop for duplicate people in a room.
 *
 * A socket can die without the server ever being told — a laptop lid closing,
 * a network dropping, a browser running an old cached build. The tab-id
 * takeover handles reconnects from a current client; this covers everything
 * else by dropping sockets that stop answering.
 *
 * Needs a dev server started with a short window, otherwise the test would
 * sit for two and a half minutes:
 *
 *   npx wrangler dev --port 8794 --local --var SOCKET_STALE_MS:4000
 *   PORT=8794 npm run test:stale
 */
const PORT = process.env.PORT || 8794;
const WINDOW_MS = Number(process.env.SOCKET_STALE_MS || 4000);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const room = `stale-${Math.random().toString(36).slice(2, 8)}`;

const fail = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fail.push(name);
}

function client(name, { cid, ping = true } = {}) {
  const q = new URLSearchParams({ name });
  if (cid) q.set("cid", cid);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/room/${room}?${q}`);
  const c = { ws, last: null, timer: null };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "state" || m.type === "welcome") c.last = m;
  };
  return new Promise((res, rej) => {
    ws.onopen = () => {
      // A healthy client pings; this is what proves it is still there.
      if (ping) {
        c.timer = setInterval(() => {
          try {
            ws.send(JSON.stringify({ type: "ping", echo: Date.now() }));
          } catch {
            /* closed */
          }
        }, Math.max(500, WINDOW_MS / 4));
      }
      res(c);
    };
    ws.onerror = rej;
  });
}

const names = (c) => (c.last?.members || []).map((m) => m.name).sort().join(",");

const obs = await client("Observer");
// Never pings: stands in for a connection that died without a close frame.
const ghost = await client("Ghost", { ping: false });
await wait(600);
check("both are present to begin with", names(obs) === "Ghost,Observer", names(obs));

await wait(WINDOW_MS * 2 + 1500);
check("the silent socket is dropped", names(obs) === "Observer", names(obs));
check("the drop is explained in the log", JSON.stringify(obs.last.log).includes("Ghost dropped out"), obs.last.log[0]?.text);
check("the healthy socket is untouched", obs.ws.readyState === 1, `readyState ${obs.ws.readyState}`);

// And a client that keeps answering is never reaped, however long it idles.
await wait(WINDOW_MS * 2);
check("a pinging client survives indefinitely", names(obs) === "Observer", names(obs));

clearInterval(obs.timer);
obs.ws.close();
ghost.ws.close();
await wait(200);
console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join(", ")}` : "\nAll checks passed.");
process.exit(fail.length ? 1 : 0);
