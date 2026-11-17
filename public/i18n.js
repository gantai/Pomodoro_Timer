/* English and 简体中文.
 *
 * Language is a per-person setting, not a room setting. Everything else about
 * a room is shared — the clock, the furniture, the notes — but two people
 * sitting in the same room may not read the same language, and forcing a
 * shared choice would mean one of them loses. It is remembered per browser,
 * like the display name and the icon.
 *
 * Item names come in two forms: `item.*` for the furniture tray, where Title
 * Case is right, and `itemLow.*` for the middle of a sentence, where it is
 * not. Chinese has no case, so the two are identical there — kept separate
 * all the same, because a missing key would otherwise fall back to English.
 *
 * The activity feed is the reason the server stores log entries as a key plus
 * its arguments rather than a finished sentence: the sentence is built in the
 * reader's language, at render time, so the same event reads correctly for
 * everyone in the room at once. Entries written before that change kept their
 * prose and are shown as they are.
 */

export const LANGS = [
  { id: "en", label: "EN", name: "English" },
  { id: "zh", label: "中文", name: "简体中文" },
];

const LANG_KEY = "pomo.lang";

const STRINGS = {
  en: {
    "app.tagline": "Pomo Together — a shared Pomodoro timer",
    "app.source": "Source",

    "land.title": "Run the same Pomodoro, with everyone at once.",
    "land.lede":
      "Create a room, send the link, and every screen counts down together. Anyone can start, pause or change the lengths — the clock lives on the server, so nobody drifts out of step.",
    "land.create": "Create a room",
    "land.placeholder": "or name one, e.g. standup",
    "land.open": "Open",
    "land.fineprint":
      "No sign-up, no accounts, nothing to install. Naming a room gives your group a link worth bookmarking — reopen it tomorrow and your settings are still there.",
    "land.yourRooms": "Your rooms",
    "land.roomsNote": "Remembered on this device only. A room is deleted after 30 days without use.",
    "land.badCode": "Use letters, numbers and hyphens — at least 3 characters",
    "land.forget": "Remove from this list",
    "land.step1": "1 · Create",
    "land.step1b": "One click makes a room with its own address, like <code>/r/quiet-ember-42</code>.",
    "land.step2": "2 · Share the link",
    "land.step2b": "Anyone who opens it joins instantly. No names to register, no invites to accept.",
    "land.step3": "3 · Work in step",
    "land.step3b":
      "Start, pause, skip and the lengths are shared by the room, and a chime marks the end of every session — work or rest.",
    "land.foot": "Runs on Cloudflare Workers · one Durable Object per room",
    "land.demoHere": "{n} here",
    "land.demoMeta": "Focus · round 2 of 4",

    "conn.connecting": "connecting…",
    "conn.live": "in sync",
    "conn.down": "reconnecting…",
    "conn.elsewhere": "open in another window",

    "phase.focus": "Focus",
    "phase.short": "Short break",
    "phase.long": "Long break",
    "phase.focus.low": "focus",
    "phase.short.low": "short break",
    "phase.long.low": "long break",

    "ctl.start": "Start",
    "ctl.pause": "Pause",
    "ctl.skip": "Skip",
    "ctl.reset": "Reset",
    "ctl.skipTitle": "Jump to the next phase",
    "ctl.resetTitle": "Restart this phase",
    "ctl.shared": "Start, pause and skip are shared — everyone in the room sees them",
    "ctl.copy": "Copy invite link",
    "ctl.copied": "Invite link copied — send it to your group",
    "ctl.copyPrompt": "Copy this link:",

    "room.moveHint": "Arrow keys or <kbd>WASD</kbd> to walk · or click where you want to go",
    "room.meta": "{phase} · round {n} of {of}",
    "room.metaDone": "{phase} · round {n} of {of} · {done} focus sessions done",
    "room.metaDone1": "{phase} · round {n} of {of} · 1 focus session done",
    "room.titlePaused": " (paused)",

    "rail.here": "In this room",
    "rail.justYou": "just you",
    "rail.people": "{n} people",
    "rail.you": "you",
    "rail.rename": "Change your name or icon",
    "rail.thisRoom": "This room",
    "rail.decorate": "Decorate",
    "rail.decorating": "Done",
    "rail.wall": "Doodle wall",
    "rail.hideRoom": "Hide room",
    "rail.showRoom": "Show room",
    "rail.keepNote": "Furniture, notes and the wall all stay until the room is deleted.",
    "rail.delete": "Delete this room…",

    "dec.undo": "Undo",
    "dec.reset": "Reset room",
    "dec.done": "Done",
    "dec.hint":
      "Drag furniture with the hand to rearrange it, pick a piece to place a new one, or use the eraser to take one away. Everyone in the room sees the change.",
    "dec.move": "Move",
    "dec.moveTitle": "Move furniture — drag a piece to a new spot",
    "dec.remove": "Remove",
    "dec.removeTitle": "Remove furniture",
    "dec.confirmReset": "Put the room back to its original furniture? Everyone's room changes.",
    "dec.full": "The room is full — remove something first",

    "board.title": "Message board",
    "board.new": "{n} new",
    "board.placeholder": "Leave a note for the room…",
    "board.post": "Pin it",
    "board.count": "{n} of {max} · stays until deleted",
    "board.empty": "No notes yet. Leave one for whoever is here next.",
    "board.full": "The board was full — the oldest note was dropped",
    "board.removeTitle": "Remove this note",

    "wall.title": "Doodle wall",
    "wall.clear": "Clear the wall",
    "wall.undo": "Undo clear",
    "wall.confirmClear": "Wipe the whole wall for everyone? One undo is kept.",
    "wall.pen": "Pen",
    "wall.eraser": "Eraser",
    "wall.nib": "Nib size",

    "set.title": "Timer lengths",
    "set.focus": "Focus",
    "set.short": "Short break",
    "set.long": "Long break",
    "set.rounds": "Long break every",
    "set.min": "min",
    "set.roundsUnit": "rounds",
    "set.auto": "Auto-start next phase",
    "set.sound": "Chime at the end of a session",
    "set.soundTitle": "Plays for everyone with sound on, at the end of both work and rest",
    "set.classic": "Classic 25/5/15",
    "set.deep": "Deep 50/10/30",
    "set.sprint": "Sprint 15/3/15",
    "set.note": "Applies to everyone. A new length takes effect next phase if the clock is already running.",

    "act.title": "Activity",
    "act.empty": "Nothing yet — start the timer.",

    "gate.who": "Who are you?",
    "gate.change": "Change your name or icon",
    "gate.note": "Everyone in <b>{room}</b> sees this name and icon next to what you do.",
    "gate.name": "Your name",
    "gate.pickIcon": "Pick your icon",
    "gate.join": "Join the room",
    "gate.anon": "Stay anonymous",
    "gate.anonAfter": "Reload the room to go back to being a guest",

    "del.title": "Delete this room?",
    "del.body":
      "Everything in <b>{room}</b> goes, for everyone, now and permanently: the furniture, the notes on the board, the doodle wall, the timer lengths and the activity log. Anyone still in the room is sent back to the start page.",
    "del.link": "The link itself keeps working — opening it again creates a new, empty room with the same name.",
    "del.confirm": "Type <b>{room}</b> to confirm",
    "del.keep": "Keep the room",
    "del.go": "Delete it",
    "del.mismatch": "That doesn't match the room's name",
    "del.done": "The room was deleted",
    "del.byOther": "{name} deleted this room",

    "lang.label": "Language",

    "toast.first": "You're first in — copy the invite link to bring your group",
    "toast.replaced": "You opened this room in another window — reload here to use this one instead",
    "toast.reconnecting": "Reconnecting…",
    "toast.focusDone": "Focus finished — time for a break",
    "toast.breakDone": "Break over — back to focus",

    "ago.now": "just now",
    "ago.s": "{n}s ago",
    "ago.m": "{n}m ago",
    "ago.h": "{n}h ago",
    "ago.yesterday": "yesterday",
    "ago.d": "{n}d ago",

    "icon.person": "Person",
    "icon.cat": "Cat",
    "icon.dog": "Dog",
    "icon.fox": "Fox",
    "icon.bunny": "Bunny",
    "icon.bear": "Bear",
    "icon.frog": "Frog",
    "icon.owl": "Owl",
    "icon.penguin": "Penguin",

    "item.desk": "Desk",
    "item.chair": "Chair",
    "item.sofa": "Sofa",
    "item.standdesk": "Sit-stand desk",
    "item.monitor": "Monitor",
    "item.coffee": "Coffee machine",
    "item.counter": "Counter",
    "item.cafetable": "Café table",
    "item.vending": "Vending machine",
    "item.treadmill": "Treadmill",
    "item.dumbbells": "Dumbbell rack",
    "item.shelf": "Shelf",
    "item.plant": "Plant",
    "item.window": "Window",
    "item.clock": "Clock",
    "item.cat": "Cat",
    "item.rug": "Rug",

    "itemLow.desk": "desk",
    "itemLow.chair": "chair",
    "itemLow.sofa": "sofa",
    "itemLow.standdesk": "sit-stand desk",
    "itemLow.monitor": "monitor",
    "itemLow.coffee": "coffee machine",
    "itemLow.counter": "counter",
    "itemLow.cafetable": "café table",
    "itemLow.vending": "vending machine",
    "itemLow.treadmill": "treadmill",
    "itemLow.dumbbells": "dumbbell rack",
    "itemLow.shelf": "shelf",
    "itemLow.plant": "plant",
    "itemLow.window": "window",
    "itemLow.clock": "clock",
    "itemLow.cat": "cat",
    "itemLow.rug": "rug",

    "log.joined": "{name} joined",
    "log.left": "{name} left",
    "log.dropped": "{name} dropped out",
    "log.renamed": "{was} is now {name}",
    "log.started": "{name} started the {phase}",
    "log.paused": "{name} paused",
    "log.reset": "{name} reset the timer",
    "log.skipped": "{name} skipped the {phase}",
    "log.switched": "{name} switched to {phase}",
    "log.lengths": "{name} set {detail}",
    "log.lengthPart": "{phase} to {n}m",
    "log.added": "{name} added a {item}",
    "log.moved": "{name} moved a {item}",
    "log.removed": "{name} removed a {item}",
    "log.layoutReset": "{name} put the room back to its original layout",
    "log.layoutUndo": "{name} undid the last change to the room",
    "log.finished": "{from} finished — {to} is up next",
    "log.allLeft": "Everyone left — timer reset and ready to start",
    "log.noted": "{name} pinned a note",
    "log.unnoted": "{name} removed a note",
    "log.wallCleared": "{name} cleared the doodle wall",
    "log.wallUndo": "{name} put the doodle wall back",
  },

  zh: {
    "app.tagline": "Pomo Together — 多人共用的番茄钟",
    "app.source": "源代码",

    "land.title": "一群人，同一个番茄钟。",
    "land.lede":
      "开一个房间，把链接发出去，每个人的屏幕一起倒数。任何人都可以开始、暂停或改时长——时钟跑在服务器上，谁都不会走偏。",
    "land.create": "开一个房间",
    "land.placeholder": "或自己起名，例如 standup",
    "land.open": "进入",
    "land.fineprint":
      "不用注册、不用账号、不用安装。给房间起个名字，就得到一条值得收藏的链接——明天再打开，设置都还在。",
    "land.yourRooms": "你的房间",
    "land.roomsNote": "只记在这台设备上。房间超过 30 天没人用就会被删除。",
    "land.badCode": "只能用字母、数字和连字符，至少 3 个字符",
    "land.forget": "从列表中移除",
    "land.step1": "1 · 开房间",
    "land.step1b": "点一下就有一个专属地址，例如 <code>/r/quiet-ember-42</code>。",
    "land.step2": "2 · 发链接",
    "land.step2b": "打开链接就进来了。不用登记名字，也不用接受邀请。",
    "land.step3": "3 · 一起专注",
    "land.step3b": "开始、暂停、跳过和时长都是全房共享的，每一段结束——无论工作还是休息——都会响提示音。",
    "land.foot": "运行在 Cloudflare Workers 上 · 每个房间一个 Durable Object",
    "land.demoHere": "{n} 人在线",
    "land.demoMeta": "专注 · 第 2 / 4 轮",

    "conn.connecting": "连接中…",
    "conn.live": "已同步",
    "conn.down": "重新连接中…",
    "conn.elsewhere": "已在另一个窗口打开",

    "phase.focus": "专注",
    "phase.short": "短休息",
    "phase.long": "长休息",
    "phase.focus.low": "专注",
    "phase.short.low": "短休息",
    "phase.long.low": "长休息",

    "ctl.start": "开始",
    "ctl.pause": "暂停",
    "ctl.skip": "跳过",
    "ctl.reset": "重置",
    "ctl.skipTitle": "直接进入下一段",
    "ctl.resetTitle": "重新开始这一段",
    "ctl.shared": "开始、暂停和跳过是共享的——房间里每个人都看得到",
    "ctl.copy": "复制邀请链接",
    "ctl.copied": "邀请链接已复制——发给你的伙伴吧",
    "ctl.copyPrompt": "复制这条链接：",

    "room.moveHint": "方向键或 <kbd>WASD</kbd> 走动 · 也可以点哪走哪",
    "room.meta": "{phase} · 第 {n} / {of} 轮",
    "room.metaDone": "{phase} · 第 {n} / {of} 轮 · 已完成 {done} 段专注",
    "room.metaDone1": "{phase} · 第 {n} / {of} 轮 · 已完成 1 段专注",
    "room.titlePaused": "（已暂停）",

    "rail.here": "房间里的人",
    "rail.justYou": "只有你",
    "rail.people": "{n} 人",
    "rail.you": "你",
    "rail.rename": "改名字或图标",
    "rail.thisRoom": "这个房间",
    "rail.decorate": "布置",
    "rail.decorating": "完成",
    "rail.wall": "涂鸦墙",
    "rail.hideRoom": "隐藏房间",
    "rail.showRoom": "显示房间",
    "rail.keepNote": "家具、留言和涂鸦墙都会一直留着，直到房间被删除。",
    "rail.delete": "删除这个房间…",

    "dec.undo": "撤销",
    "dec.reset": "恢复原样",
    "dec.done": "完成",
    "dec.hint": "用手拖动家具重新摆放；选一件家具再点房间放下新的；用橡皮拿走不要的。房间里每个人都会同步看到。",
    "dec.move": "移动",
    "dec.moveTitle": "移动家具——拖到新位置",
    "dec.remove": "拿走",
    "dec.removeTitle": "拿走家具",
    "dec.confirmReset": "把房间恢复成最初的家具？所有人的房间都会变。",
    "dec.full": "房间放满了——先拿走一些",

    "board.title": "留言板",
    "board.new": "{n} 条新的",
    "board.placeholder": "给这个房间留句话…",
    "board.post": "贴上去",
    "board.count": "{n} / {max} 条 · 删除房间前一直都在",
    "board.empty": "还没有留言。给下一个进来的人留一句吧。",
    "board.full": "留言板满了——最早的一条被挤掉了",
    "board.removeTitle": "撕掉这条留言",

    "wall.title": "涂鸦墙",
    "wall.clear": "清空整面墙",
    "wall.undo": "撤销清空",
    "wall.confirmClear": "把整面墙给所有人清空？可以撤销一次。",
    "wall.pen": "画笔",
    "wall.eraser": "橡皮",
    "wall.nib": "笔尖粗细",

    "set.title": "时长设置",
    "set.focus": "专注",
    "set.short": "短休息",
    "set.long": "长休息",
    "set.rounds": "每几轮一次长休息",
    "set.min": "分钟",
    "set.roundsUnit": "轮",
    "set.auto": "自动开始下一段",
    "set.sound": "每段结束时响提示音",
    "set.soundTitle": "工作和休息结束时，都会在开了声音的人那里响起",
    "set.classic": "经典 25/5/15",
    "set.deep": "深度 50/10/30",
    "set.sprint": "冲刺 15/3/15",
    "set.note": "对所有人生效。时钟正在走的时候，新时长从下一段开始生效。",

    "act.title": "动态",
    "act.empty": "还没有动静——开始计时吧。",

    "gate.who": "怎么称呼你？",
    "gate.change": "改名字或图标",
    "gate.note": "<b>{room}</b> 里的每个人都会在你的动作旁边看到这个名字和图标。",
    "gate.name": "你的名字",
    "gate.pickIcon": "选一个图标",
    "gate.join": "进入房间",
    "gate.anon": "就这样匿名",
    "gate.anonAfter": "重新载入房间就会变回访客身份",

    "del.title": "删除这个房间？",
    "del.body":
      "<b>{room}</b> 里的一切都会消失，对所有人，立刻，且无法恢复：家具、留言板上的留言、涂鸦墙、时长设置和动态记录。还在房间里的人会被送回首页。",
    "del.link": "链接本身还能用——再次打开会得到一个同名的、全新的空房间。",
    "del.confirm": "输入 <b>{room}</b> 以确认",
    "del.keep": "留着",
    "del.go": "删除",
    "del.mismatch": "和房间名字对不上",
    "del.done": "房间已删除",
    "del.byOther": "{name} 删除了这个房间",

    "lang.label": "语言",

    "toast.first": "你是第一个到的——复制邀请链接，把伙伴叫过来",
    "toast.replaced": "你在另一个窗口打开了这个房间——想用这个窗口的话请重新载入",
    "toast.reconnecting": "正在重新连接…",
    "toast.focusDone": "专注结束——休息一下",
    "toast.breakDone": "休息结束——回到专注",

    "ago.now": "刚刚",
    "ago.s": "{n} 秒前",
    "ago.m": "{n} 分钟前",
    "ago.h": "{n} 小时前",
    "ago.yesterday": "昨天",
    "ago.d": "{n} 天前",

    "icon.person": "小人",
    "icon.cat": "猫",
    "icon.dog": "狗",
    "icon.fox": "狐狸",
    "icon.bunny": "兔子",
    "icon.bear": "熊",
    "icon.frog": "青蛙",
    "icon.owl": "猫头鹰",
    "icon.penguin": "企鹅",

    "item.desk": "书桌",
    "item.chair": "椅子",
    "item.sofa": "沙发",
    "item.standdesk": "电动升降桌",
    "item.monitor": "显示器",
    "item.coffee": "咖啡机",
    "item.counter": "吧台",
    "item.cafetable": "咖啡桌",
    "item.vending": "自动售货机",
    "item.treadmill": "跑步机",
    "item.dumbbells": "哑铃架",
    "item.shelf": "书架",
    "item.plant": "盆栽",
    "item.window": "窗户",
    "item.clock": "挂钟",
    "item.cat": "猫",
    "item.rug": "地毯",

    "itemLow.desk": "书桌",
    "itemLow.chair": "椅子",
    "itemLow.sofa": "沙发",
    "itemLow.standdesk": "电动升降桌",
    "itemLow.monitor": "显示器",
    "itemLow.coffee": "咖啡机",
    "itemLow.counter": "吧台",
    "itemLow.cafetable": "咖啡桌",
    "itemLow.vending": "自动售货机",
    "itemLow.treadmill": "跑步机",
    "itemLow.dumbbells": "哑铃架",
    "itemLow.shelf": "书架",
    "itemLow.plant": "盆栽",
    "itemLow.window": "窗户",
    "itemLow.clock": "挂钟",
    "itemLow.cat": "猫",
    "itemLow.rug": "地毯",

    "log.joined": "{name} 进来了",
    "log.left": "{name} 离开了",
    "log.dropped": "{name} 掉线了",
    "log.renamed": "{was} 改名为 {name}",
    "log.started": "{name} 开始了{phase}",
    "log.paused": "{name} 暂停了",
    "log.reset": "{name} 重置了计时",
    "log.skipped": "{name} 跳过了{phase}",
    "log.switched": "{name} 切到了{phase}",
    "log.lengths": "{name} 把{detail}",
    "log.lengthPart": "{phase}设成了 {n} 分钟",
    "log.added": "{name} 摆了一个{item}",
    "log.moved": "{name} 挪了一下{item}",
    "log.removed": "{name} 拿走了一个{item}",
    "log.layoutReset": "{name} 把房间恢复成了最初的样子",
    "log.layoutUndo": "{name} 撤销了上一次改动",
    "log.finished": "{from}结束了——接下来是{to}",
    "log.allLeft": "所有人都离开了——计时已重置，随时可以开始",
    "log.noted": "{name} 贴了一条留言",
    "log.unnoted": "{name} 撕掉了一条留言",
    "log.wallCleared": "{name} 清空了涂鸦墙",
    "log.wallUndo": "{name} 把涂鸦墙还原了",
  },
};

export const LANG_IDS = LANGS.map((l) => l.id);

let current = "en";

/** Browsers report zh-CN, zh-Hans, zh-TW…; all of them want the Chinese UI. */
function guess() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (LANG_IDS.includes(stored)) return stored;
  } catch {
    /* no storage — fall through to the browser's own preference */
  }
  for (const tag of navigator.languages || [navigator.language || "en"]) {
    if (String(tag).toLowerCase().startsWith("zh")) return "zh";
  }
  return "en";
}

export function lang() {
  return current;
}

export function initLang() {
  current = guess();
  document.documentElement.lang = current === "zh" ? "zh-Hans" : "en";
  return current;
}

export function setLang(id) {
  if (!LANG_IDS.includes(id)) return current;
  current = id;
  document.documentElement.lang = id === "zh" ? "zh-Hans" : "en";
  try {
    localStorage.setItem(LANG_KEY, id);
  } catch {
    /* the choice just won't survive a reload */
  }
  return current;
}

const fill = (s, params) =>
  params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;

/** Falls back to English, then to the key itself — a missing string should
 *  look wrong in development, not throw in somebody's room. */
export function t(key, params) {
  const s = STRINGS[current]?.[key] ?? STRINGS.en[key] ?? key;
  return fill(s, params);
}

export function ago(ts) {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 10) return t("ago.now");
  if (secs < 60) return t("ago.s", { n: secs });
  const mins = Math.round(secs / 60);
  if (mins < 60) return t("ago.m", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("ago.h", { n: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? t("ago.yesterday") : t("ago.d", { n: days });
}

/**
 * Render one activity entry. Entries are {k, a} — a key and its arguments —
 * so the same event reads in whatever language each person has chosen. Older
 * rooms hold entries that were stored as finished English prose; those carry
 * `text` and are shown unchanged rather than dropped.
 */
export function logLine(entry) {
  if (!entry) return "";
  if (entry.k) {
    const a = { ...(entry.a || {}) };
    if (a.phase) a.phase = t(`phase.${a.phase}.low`);
    if (a.from) a.from = t(`phase.${a.from}.low`);
    if (a.to) a.to = t(`phase.${a.to}.low`);
    // Title Case belongs on a tray button, not inside a sentence.
    if (a.item) a.item = t(`itemLow.${a.item}`);
    if (Array.isArray(a.parts)) {
      a.detail = a.parts
        .map((p) => t("log.lengthPart", { phase: t(`phase.${p.phase}.low`), n: p.n }))
        .join(current === "zh" ? "、" : ", ");
    }
    return t(`log.${entry.k}`, a);
  }
  return entry.text || "";
}
