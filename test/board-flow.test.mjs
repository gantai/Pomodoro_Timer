import { chromium } from "playwright";
const B = "http://127.0.0.1:8795";
let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? (pass++, console.log("PASS " + n + (d ? ` — ${d}` : ""))) : (fail++, console.log("FAIL " + n + (d ? ` — ${d}` : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const errs = [];
const room = `flow-${Math.random().toString(36).slice(2, 7)}`;
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

const say = async (page, text) => { await page.fill("#noteInput", text); await page.click("#postNote"); await page.waitForTimeout(350); };
await say(a, "First: kicking off at 10.");
await say(s, "Second: I'll bring the notes.");
await say(a, "Third: moved to the reading room.");
await s.waitForTimeout(400);

const texts = await a.evaluate(() => [...document.querySelectorAll(".note__text")].map(e => e.textContent));
ck("notes read oldest to newest, top to bottom", texts[0].startsWith("First") && texts[2].startsWith("Third"), texts.map(t => t.split(":")[0]).join(" → "));

const layout = await a.evaluate(() => {
  const ns = [...document.querySelectorAll(".note")].map(n => n.getBoundingClientRect());
  return { oneColumn: ns.every(r => Math.abs(r.left - ns[0].left) < 1), stacked: ns[1].top > ns[0].top };
});
ck("one column, not a grid", layout.oneColumn && layout.stacked);

const near = await a.evaluate(() => {
  const last = [...document.querySelectorAll(".note")].pop().getBoundingClientRect();
  const box = document.getElementById("noteInput").getBoundingClientRect();
  return Math.round(box.top - last.bottom);
});
ck("the newest note sits against the box you type in", near >= 0 && near < 40, `${near}px apart`);

ck("your own notes are marked", await a.evaluate(() =>
  [...document.querySelectorAll(".note")].filter(n => n.classList.contains("note--mine")).length === 2));
ck("…and are the other person's on their screen", await s.evaluate(() =>
  [...document.querySelectorAll(".note")].filter(n => n.classList.contains("note--mine")).length === 1));

// a long board scrolls to the newest, and holds position while you read back
for (let i = 0; i < 12; i++) await say(s, `Filler note number ${i + 4}, long enough to take a line of its own.`);
await a.waitForTimeout(600);
ck("a long board opens at the newest note", await a.evaluate(() => {
  const l = document.getElementById("boardList");
  return l.scrollHeight - l.scrollTop - l.clientHeight < 24;
}));
await a.evaluate(() => (document.getElementById("boardList").scrollTop = 0));
await say(s, "Arriving while you read older ones.");
await a.waitForTimeout(500);
ck("it does not yank you to the bottom while you read back",
   await a.evaluate(() => document.getElementById("boardList").scrollTop < 40));

const measure = await a.evaluate(() => Math.round(document.querySelector(".note__text").getBoundingClientRect().width));
ck("the text keeps a readable measure", measure <= 620, `${measure}px`);

// the fade marks only the edge that is actually hiding something
const edges = await a.evaluate(() => {
  const l = document.getElementById("boardList");
  const read = () => [l.classList.contains("has-above"), l.classList.contains("has-below")];
  l.scrollTop = 0; l.dispatchEvent(new Event("scroll"));
  const top = read();
  l.scrollTop = l.scrollHeight; l.dispatchEvent(new Event("scroll"));
  const bottom = read();
  l.scrollTop = l.scrollHeight / 2; l.dispatchEvent(new Event("scroll"));
  return { top, bottom, middle: read() };
});
ck("no fade above the first note", edges.top[0] === false && edges.top[1] === true, JSON.stringify(edges.top));
ck("no fade below the last note", edges.bottom[0] === true && edges.bottom[1] === false, JSON.stringify(edges.bottom));
ck("both edges fade in the middle", edges.middle[0] && edges.middle[1]);

await a.evaluate(() => document.querySelector(".board").scrollIntoView({ block: "center" }));
await a.waitForTimeout(300);
await a.locator(".board").screenshot({ path: "board-flow.png" });
console.log(errs.length ? "\nERRORS:\n" + errs.join("\n") : "\nno console errors");
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
