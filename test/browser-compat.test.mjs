import { chromium } from "playwright";
const B = "http://127.0.0.1:8795";
let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? (pass++, console.log("PASS " + n + (d ? ` — ${d}` : ""))) : (fail++, console.log("FAIL " + n + (d ? ` — ${d}` : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const errs = [];

// cache headers must tell the browser to revalidate, for every asset
const probe = await b.newContext();
const api = await probe.newPage();
for (const path of ["/", "/app.js", "/styles.css", "/i18n.js", "/pixel/art.js"]) {
  const r = await api.request.get(B + path);
  const cc = r.headers()["cache-control"] || "(none)";
  ck(`revalidates ${path}`, /no-cache|max-age=0/.test(cc), cc);
}
await probe.close();

async function room(width, height, meta = false) {
  const ctx = await b.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  const id = `sf-${Math.random().toString(36).slice(2, 7)}`;
  await p.goto(`${B}/r/${id}`);
  await p.evaluate(() => {
    localStorage.setItem("pomo.name", "Yun F."); localStorage.setItem("pomo.nameAsked", "1");
    localStorage.setItem("pomo.lang", "en");
  });
  await p.reload(); await p.waitForTimeout(1100);
  if (meta) {
    // drive the clock to a long meta string: "round 3 of 4 · N focus sessions done"
    await p.evaluate(() => { for (let i = 0; i < 5; i++) document.getElementById("skip").click(); });
    await p.waitForTimeout(700);
  }
  return p;
}

// the HUD must not swallow the room, even when the meta line is long
for (const [w, h] of [[1500, 1000], [1180, 900], [980, 820]]) {
  const p = await room(w, h, true);
  const r = await p.evaluate(() => {
    const hud = document.querySelector(".hud").getBoundingClientRect();
    const can = document.getElementById("pixelRoom").getBoundingClientRect();
    return {
      cover: +((hud.width * hud.height) / (can.width * can.height)).toFixed(3),
      fits: hud.width <= can.width + 1 && hud.bottom <= can.bottom,
      rs: getComputedStyle(document.getElementById("sceneFrame")).getPropertyValue("--rs").trim(),
      meta: document.getElementById("meta").textContent,
      clock: Math.round(parseFloat(getComputedStyle(document.getElementById("time")).fontSize)),
      roomH: Math.round(can.height),
    };
  });
  ck(`HUD stays inside the room at ${w}x${h}`, r.fits, JSON.stringify(r));
  ck(`HUD covers under a quarter of the room at ${w}x${h}`, r.cover < 0.25, `${Math.round(r.cover * 100)}%`);
  ck(`clock scales with the room at ${w}x${h}`, r.clock < r.roomH * 0.22, `${r.clock}px on a ${r.roomH}px room`);
  await p.close();
}

// the activity fold must still toggle with the summary restructured
const p = await room(1400, 950);
ck("activity starts shut", await p.evaluate(() => !document.getElementById("activityFold").open));
await p.click("#activityFold summary");
await p.waitForTimeout(200);
ck("clicking the summary opens it", await p.evaluate(() => document.getElementById("activityFold").open));
await p.click("#activityFold summary");
await p.waitForTimeout(200);
ck("clicking again shuts it", await p.evaluate(() => !document.getElementById("activityFold").open));

// prefixed properties actually present in the served stylesheet
const css = await (await p.request.get(B + "/styles.css")).text();
for (const prop of ["-webkit-backdrop-filter", "-webkit-mask-image", "-webkit-appearance"]) {
  ck(`stylesheet carries ${prop}`, css.includes(prop));
}
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");   // comments mention it on purpose
ck("summary is not display:flex", !/\.fold > summary \{[^}]*display:\s*flex/s.test(bare));

console.log(errs.length ? "\nERRORS:\n" + errs.join("\n") : "\nno console errors");
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
