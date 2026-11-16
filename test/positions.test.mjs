import { chromium } from "playwright";
const B = "http://127.0.0.1:8795";
let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? (pass++, console.log("PASS " + n + (d ? ` — ${d}` : ""))) : (fail++, console.log("FAIL " + n + (d ? ` — ${d}` : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const errs = [];
const room = `pos-${Math.random().toString(36).slice(2, 7)}`;
async function person(name, icon = "fox") {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(`${B}/r/${room}`);
  await p.evaluate(([n, i]) => {
    localStorage.setItem("pomo.name", n); localStorage.setItem("pomo.nameAsked", "1");
    localStorage.setItem("pomo.icon", i); localStorage.setItem("pomo.lang", "en");
    localStorage.setItem("pomo.hideWall", "1");
  }, [name, icon]);
  await p.reload(); await p.waitForTimeout(1100);
  return p;
}
const tagOf = (page, name) => page.evaluate((n) => {
  const el = [...document.querySelectorAll(".tag")].find((t) => t.textContent === n);
  return el ? { left: Math.round(parseFloat(el.style.left)), top: Math.round(parseFloat(el.style.top)) } : null;
}, name);

const a = await person("Mei"), s = await person("Sam", "penguin");
await a.waitForTimeout(600);

// Mei walks somewhere specific
await a.click("#pixelRoom", { position: { x: 100, y: 300 } });
await a.waitForTimeout(2200);
const before = await tagOf(a, "Mei");
const seenBySam = await tagOf(s, "Mei");
ck("Mei walked away from the start", before && before.top > 150, JSON.stringify(before));
ck("Sam sees her there", seenBySam && Math.abs(seenBySam.left - before.left) < 6 && Math.abs(seenBySam.top - before.top) < 6, JSON.stringify(seenBySam));

// ── reload: same place, same id (so same colours), without being announced ──
const idBefore = await a.evaluate(() => JSON.parse(localStorage.getItem("pomo.cid") ? '"' + localStorage.getItem("pomo.cid") + '"' : "null"));
const peekBefore = await s.evaluate(() => document.getElementById("activityPeek").textContent);
await a.reload(); await a.waitForTimeout(1600);
const after = await tagOf(a, "Mei");
ck("after a reload Mei is back where she stood", after && Math.abs(after.left - before.left) < 6 && Math.abs(after.top - before.top) < 6, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
const samAfter = await tagOf(s, "Mei");
ck("…and Sam still sees her there", samAfter && Math.abs(samAfter.top - before.top) < 6, JSON.stringify(samAfter));
ck("the reload was not announced as a join", (await s.evaluate(() => document.getElementById("activityPeek").textContent)) === peekBefore);
ck("Sam was not moved by Mei's reload", (await tagOf(s, "Sam")).top === (await tagOf(a, "Sam")).top);

// ── a stable id: a fully closed socket reconnecting gets the same id ──
const ids = await a.evaluate(async () => {
  const cid = "stable-" + Math.random().toString(36).slice(2, 12);
  const open = () => new Promise((res) => {
    const ws = new WebSocket(`ws://${location.host}/api/room/${location.pathname.split("/").pop()}?name=Probe&cid=${cid}`);
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "welcome") { res([ws, m.you.id]); } };
  });
  const [w1, id1] = await open();
  w1.close();
  await new Promise((r) => setTimeout(r, 700));      // let the close land, so nothing is there to take over
  const [w2, id2] = await open();
  w2.close();
  return { id1, id2 };
});
ck("a browser keeps its id across a full disconnect", ids.id1 === ids.id2, `${ids.id1} / ${ids.id2}`);
ck("the id is not the handle itself", !ids.id1.startsWith("stable-") && ids.id1.length === 8, ids.id1);

// ── a newcomer is told where everyone is, even with nothing in server memory ──
const c = await person("Alex", "frog");
await c.waitForTimeout(1200);
const alexSeesMei = await tagOf(c, "Mei");
ck("a newcomer sees Mei where she really is", alexSeesMei && Math.abs(alexSeesMei.top - before.top) < 6, JSON.stringify(alexSeesMei));

console.log(errs.length ? "\nERRORS:\n" + errs.join("\n") : "\nno console errors");
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
