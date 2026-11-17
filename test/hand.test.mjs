import { chromium } from "playwright";
const B = "http://127.0.0.1:8795";
let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? (pass++, console.log("PASS " + n + (d ? ` — ${d}` : ""))) : (fail++, console.log("FAIL " + n + (d ? ` — ${d}` : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const errs = [];
const room = `hand-${Math.random().toString(36).slice(2, 7)}`;
async function person(name, icon = "fox") {
  const p = await (await b.newContext({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 2 })).newPage();
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(`${B}/r/${room}`);
  await p.evaluate(([n, i]) => {
    localStorage.setItem("pomo.name", n); localStorage.setItem("pomo.nameAsked", "1");
    localStorage.setItem("pomo.icon", i); localStorage.setItem("pomo.lang", "en");
  }, [name, icon]);
  await p.reload(); await p.waitForTimeout(1200);
  return p;
}
const a = await person("Mei"), s = await person("Sam", "penguin");
await a.waitForTimeout(500);

// the sofa: find it in the layout the server sent
const layoutOf = (page) => page.evaluate(async () => {
  // read what the scene is drawing
  return window.__layout ?? null;
});
const sofaOn = (page) => page.evaluate(() => {
  const ws = null; return null;
});

await a.click("#decorateBtn"); await a.waitForTimeout(300);
const tray = await a.evaluate(() => [...document.querySelectorAll("#palette .tool")].map((b) => ({ tool: b.dataset.tool, on: b.getAttribute("aria-checked") })));
ck("the hand is first in the tray", tray[0].tool === "move", tray.slice(0, 3).map((t) => t.tool).join(","));
ck("…and is what you're holding when it opens", tray[0].on === "true");
ck("the eraser is last", tray.at(-1).tool === "erase");
const icons = await a.evaluate(() => ["move", "erase"].map((t) => {
  const img = document.querySelector(`#palette [data-tool="${t}"] img`);
  return img && img.complete && img.naturalWidth > 0;
}));
ck("hand and eraser icons are drawn", icons.every(Boolean), JSON.stringify(icons));
ck("the doodle wall's eraser uses the same icon", await a.evaluate(() =>
  document.querySelector(".pen--erase img").src === document.querySelector('#palette [data-tool="erase"] img').src));

// drag the sofa (default at 135,156, 50x23) ten tiles to the left
const box = await a.locator("#pixelRoom").boundingBox();
const sc = box.width / 320;
const at = (x, y) => [box.x + x * sc, box.y + y * sc];
const before = await s.evaluate(() => document.getElementById("activityPeek").textContent);
await a.mouse.move(...at(160, 170));
await a.waitForTimeout(150);
ck("hovering a piece shows the grab cursor", (await a.evaluate(() => document.getElementById("pixelRoom").style.cursor)) === "grab");
await a.mouse.down();
ck("picking it up shows the grabbing cursor", (await a.evaluate(() => document.getElementById("pixelRoom").style.cursor)) === "grabbing");
for (let i = 1; i <= 8; i++) await a.mouse.move(...at(160 - i * 10, 170));
await a.mouse.up();
await a.waitForTimeout(800);

const feed = await s.evaluate(() => document.getElementById("activityPeek").textContent);
ck("the move reaches the other browser", feed.includes("moved a sofa") && feed !== before, feed);

// read the real layout from the server through a fresh socket
const layout = await a.evaluate(() => new Promise((res) => {
  const ws = new WebSocket(`ws://${location.host}/api/room/${location.pathname.split("/").pop()}?name=Probe&cid=probe-${Math.random().toString(36).slice(2, 12)}`);
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "welcome") { ws.close(); res(m.layout); } };
}));
const sofas = layout.filter((o) => o.i === "sofa");
ck("there is still exactly one sofa", sofas.length === 1, JSON.stringify(sofas));
ck("it is where it was dropped, snapped to the grid", sofas[0] && sofas[0].x === 56 && sofas[0].y === 160, JSON.stringify(sofas[0]));
ck("nothing else moved", layout.length === 26 && layout.filter((o) => o.i === "rug")[0].x === 96, `${layout.length} items`);

// clicking without dragging does nothing
const peek1 = await s.evaluate(() => document.getElementById("activityPeek").textContent);
await a.mouse.click(...at(160, 50));
await a.waitForTimeout(500);
ck("a click without a drag moves nothing", (await s.evaluate(() => document.getElementById("activityPeek").textContent)) === peek1);

// undo puts it back
await a.click("#undoLayout"); await a.waitForTimeout(700);
ck("undo puts the sofa back", (await s.evaluate(() => document.getElementById("activityPeek").textContent)).includes("undid"));

// a stale drag — the piece moved by someone else first — is refused, not misapplied
const stale = await a.evaluate(() => new Promise((res) => {
  const ws = new WebSocket(`ws://${location.host}/api/room/${location.pathname.split("/").pop()}?name=Probe2&cid=probe2-${Math.random().toString(36).slice(2, 12)}`);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "welcome") ws.send(JSON.stringify({ type: "moveItem", index: 0, i: "rug", fromX: 1, fromY: 1, x: 10, y: 10 }));
    if (m.type === "layout") { ws.close(); res(m.layout.find((o) => o.i === "rug")); }
  };
}));
ck("a move naming the wrong origin is refused", stale && stale.x === 96, JSON.stringify(stale));

await a.evaluate(() => document.getElementById("decorate").scrollIntoView({ block: "center" }));
await a.locator("#decorate").screenshot({ path: "hand-tray.png" });
console.log(errs.length ? "\nERRORS:\n" + errs.join("\n") : "\nno console errors");
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
