const { Telegraf, Markup } = require("telegraf");

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Missing BOT_TOKEN env var");

const bot = new Telegraf(token);

// Log incoming messages (helps debugging on Railway)
bot.use(async (ctx, next) => {
  const txt = ctx.message?.text;
  if (txt) console.log("IN:", txt);
  return next();
});

// In-memory state
const userState = new Map();

// Rate limit
const lastCall = new Map();
function isRateLimited(userId, ms = 900) {
  const now = Date.now();
  const last = lastCall.get(userId) || 0;
  if (now - last < ms) return true;
  lastCall.set(userId, now);
  return false;
}

function escHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toNum(x, fallback) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function weeklyRateFromAnnual(annualPct) {
  const a = annualPct / 100;
  if (a <= -1) return -1;
  return Math.pow(1 + a, 1 / 52) - 1;
}

function weeklyFeeFactorFromAnnual(feePct) {
  const f = feePct / 100;
  if (f <= 0) return 1;
  if (f >= 1) return 0;
  return Math.pow(1 - f, 1 / 52);
}

function clampParams(p) {
  const out = { ...p };

  out.weeklyAmount = Math.max(0, toNum(out.weeklyAmount, 100));
  out.years = Math.min(50, Math.max(0, toNum(out.years, 10)));
  out.annualReturnPct = Math.min(200, Math.max(-100, toNum(out.annualReturnPct, 7)));
  out.annualFeePct = Math.min(5, Math.max(0, toNum(out.annualFeePct, 0)));

  const shockOn = out.shockPct !== null && out.shockYear !== null;
  if (!shockOn) {
    out.shockPct = null;
    out.shockYear = null;
  } else {
    out.shockPct = Math.min(0, Math.max(-95, toNum(out.shockPct, -30)));
    out.shockYear = Math.min(out.years, Math.max(0, toNum(out.shockYear, 3)));
  }

  return out;
}

function simulateDCA(params) {
  const p = clampParams(params);

  const weeks = Math.max(0, Math.floor(p.years * 52));
  const rWeek = weeklyRateFromAnnual(p.annualReturnPct);
  const feeFactor = weeklyFeeFactorFromAnnual(p.annualFeePct);

  let portfolio = 0;
  let contributed = 0;

  let peak = 0;
  let maxDrawdown = 0;

  const series = [];

  let shockWeek = null;
  if (p.shockPct !== null && p.shockYear !== null) {
    shockWeek = Math.min(weeks, Math.max(1, Math.floor(p.shockYear) * 52));
  }

  let preShockPeak = null;
  let recoveryWeeks = null;
  let shockApplied = false;
  let afterShockCounter = 0;

  for (let w = 1; w <= weeks; w++) {
    portfolio += p.weeklyAmount;
    contributed += p.weeklyAmount;

    portfolio *= 1 + rWeek;
    portfolio *= feeFactor;

    if (shockWeek !== null && w === shockWeek) {
      preShockPeak = peak > 0 ? peak : portfolio;
      portfolio *= 1 + p.shockPct / 100;
      shockApplied = true;
      afterShockCounter = 0;
    }

    if (portfolio > peak) peak = portfolio;

    if (peak > 0) {
      const dd = (portfolio - peak) / peak;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }

    if (shockApplied && recoveryWeeks === null && preShockPeak !== null) {
      afterShockCounter += 1;
      if (portfolio >= preShockPeak) recoveryWeeks = afterShockCounter;
    }

    series.push(portfolio);
  }

  return {
    params: p,
    contributed,
    finalValue: portfolio,
    gains: portfolio - contributed,
    maxDrawdownPct: maxDrawdown * 100,
    recoveryWeeks,
    series
  };
}

function formatMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function parseDcaCommand(text) {
  const parts = String(text || "").trim().split(/\s+/);

  let weeklyAmount = 100;
  let years = 10;
  let annualReturnPct = 7;
  let annualFeePct = 0;

  let shockPct = null;
  let shockYear = null;

  if (parts.length >= 2) weeklyAmount = toNum(parts[1], 100);
  if (parts.length >= 3) years = toNum(parts[2], 10);
  if (parts.length >= 4) annualReturnPct = toNum(parts[3], 7);

  for (let i = 4; i < parts.length; i++) {
    const p = parts[i]?.toLowerCase();

    if (p === "fee" && i + 1 < parts.length) {
      annualFeePct = toNum(parts[i + 1], 0);
      i += 1;
      continue;
    }

    if (p === "shock" && i + 3 < parts.length) {
      const sPct = toNum(parts[i + 1], null);
      const at = parts[i + 2]?.toLowerCase();
      const sYear = toNum(parts[i + 3], null);
      if (sPct !== null && at === "at" && sYear !== null) {
        shockPct = sPct;
        shockYear = sYear;
        i += 3;
        continue;
      }
    }
  }

  return clampParams({ weeklyAmount, years, annualReturnPct, annualFeePct, shockPct, shockYear });
}

// QuickChart URL (simple, clean)
function quickChartUrl(series) {
  const maxPoints = 260;
  const step = Math.max(1, Math.floor(series.length / maxPoints));
  const sampled = [];
  for (let i = 0; i < series.length; i += step) sampled.push(Math.round(series[i]));

  const cfg = {
    type: "line",
    data: {
      labels: sampled.map((_, i) => i),
      datasets: [
        {
          data: sampled,
          pointRadius: 0,
          borderWidth: 3,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false } },
      layout: { padding: 18 },
      scales: {
        x: { display: false },
        y: {
          grid: { color: "rgba(0,0,0,0.06)" },
          ticks: { callback: (v) => Number(v).toLocaleString() }
        }
      }
    }
  };

  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return `https://quickchart.io/chart?c=${encoded}&w=980&h=560&backgroundColor=white`;
}

function keyboardFor(p) {
  const shockOn = p.shockPct !== null && p.shockYear !== null;

  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Years -1", "years:-1"),
      Markup.button.callback("Years +1", "years:+1"),
      Markup.button.callback("Return -2%", "ret:-2"),
      Markup.button.callback("Return +2%", "ret:+2")
    ],
    [
      Markup.button.callback(shockOn ? "Shock ON" : "Shock OFF", "shock:toggle"),
      Markup.button.callback("Shock year -1", shockOn ? "shockyear:-1" : "noop"),
      Markup.button.callback("Shock year +1", shockOn ? "shockyear:+1" : "noop")
    ],
    [
      Markup.button.callback("Base", "preset:base"),
      Markup.button.callback("Bull", "preset:bull"),
      Markup.button.callback("Pain", "preset:pain"),
      Markup.button.callback("Share", "share")
    ]
  ]);
}

function buildCaption(sim) {
  const p = sim.params;

  const header = `<b>${escHtml("DCA Shock Bot")}</b>`;
  const line1 = escHtml(`Weekly: $${formatMoney(p.weeklyAmount)} | Years: ${p.years} | Return: ${p.annualReturnPct}%`);

  const meta = [];
  if (p.annualFeePct > 0) meta.push(`Fee: ${p.annualFeePct}%`);
  if (p.shockPct !== null && p.shockYear !== null) meta.push(`Shock: ${p.shockPct}% @ year ${p.shockYear}`);
  if (meta.length === 0) meta.push("Shock: off");

  const line2 = escHtml(meta.join(" | "));

  const stats = [
    `Contributed: $${formatMoney(sim.contributed)}`,
    `Final: $${formatMoney(sim.finalValue)}`,
    `Gains: $${formatMoney(sim.gains)}`,
    `Max drawdown: ${sim.maxDrawdownPct.toFixed(1)}%`
  ];

  if (p.shockPct !== null && p.shockYear !== null) {
    const rec = sim.recoveryWeeks === null ? "not reached" : `${sim.recoveryWeeks} weeks`;
    stats.push(`Recovery: ${rec}`);
  }

  return [header, line1, line2, "", escHtml(stats.join("\n"))].join("\n");
}

async function renderCard(ctx, userId, params) {
  const p = clampParams(params);
  userState.set(userId, p);

  const sim = simulateDCA(p);
  const chart = quickChartUrl(sim.series);
  const caption = buildCaption(sim);
  const kb = keyboardFor(p);

  if (ctx.updateType === "callback_query") {
    try {
      await ctx.editMessageMedia(
        { type: "photo", media: chart, caption, parse_mode: "HTML" },
        { reply_markup: kb.reply_markup }
      );
    } catch (e) {
      await ctx.replyWithPhoto(chart, {
        caption,
        parse_mode: "HTML",
        reply_markup: kb.reply_markup
      });
    }
    try { await ctx.answerCbQuery(); } catch {}
    return;
  }

  await ctx.replyWithPhoto(chart, {
    caption,
    parse_mode: "HTML",
    reply_markup: kb.reply_markup
  });
}

// Commands
bot.start(async (ctx) => ctx.reply("DCA Shock Bot. Type /help"));
bot.command("ping", async (ctx) => ctx.reply("pong"));

bot.command("help", async (ctx) => {
  const msg =
    "Try:\n" +
    "/dca 100 10 8\n" +
    "/dca 100 10 8 shock -30 at 3\n" +
    "/dca 100 10 8 fee 0.2 shock -30 at 3\n\n" +
    "Or tap presets below.";
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback("Base", "preset:base"), Markup.button.callback("Bull", "preset:bull"), Markup.button.callback("Pain", "preset:pain")],
    [Markup.button.callback("Run default", "run:default")]
  ]);
  await ctx.reply(msg, kb);
});

bot.command("dca", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  try {
    const params = parseDcaCommand(ctx.message?.text || "/dca");
    await renderCard(ctx, userId, params);
  } catch (e) {
    console.error("DCA ERROR:", e);
    await ctx.reply("Error running sim. Try /help");
  }
});

bot.action("noop", async (ctx) => {
  try { await ctx.answerCbQuery("Turn shock on first"); } catch {}
});

bot.action("run:default", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await renderCard(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -30, shockYear: 3 });
});

bot.action(/^preset:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const which = ctx.match[1];
  if (which === "base") return renderCard(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -30, shockYear: 3 });
  if (which === "bull") return renderCard(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 12, annualFeePct: 0, shockPct: null, shockYear: null });
  if (which === "pain") return renderCard(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -50, shockYear: 2 });

  try { await ctx.answerCbQuery(); } catch {}
});

bot.action(/^years:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, 350)) return;

  const cur = userState.get(userId) || clampParams({});
  const delta = Number(ctx.match[1]);
  await renderCard(ctx, userId, { ...cur, years: (cur.years || 0) + delta });
});

bot.action(/^ret:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, 350)) return;

  const cur = userState.get(userId) || clampParams({});
  const delta = Number(ctx.match[1]);
  await renderCard(ctx, userId, { ...cur, annualReturnPct: (cur.annualReturnPct || 0) + delta });
});

bot.action("shock:toggle", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, 350)) return;

  const cur = userState.get(userId) || clampParams({});
  const shockOn = cur.shockPct !== null && cur.shockYear !== null;

  if (shockOn) return renderCard(ctx, userId, { ...cur, shockPct: null, shockYear: null });

  return renderCard(ctx, userId, { ...cur, shockPct: -30, shockYear: Math.min(cur.years || 10, 3) });
});

bot.action(/^shockyear:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, 350)) return;

  const cur = userState.get(userId);
  if (!cur || cur.shockPct === null || cur.shockYear === null) {
    try { await ctx.answerCbQuery("Turn shock on first"); } catch {}
    return;
  }

  const delta = Number(ctx.match[1]);
  await renderCard(ctx, userId, { ...cur, shockYear: (cur.shockYear || 0) + delta });
});

bot.action("share", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cur = userState.get(userId);
  if (!cur) {
    try { await ctx.answerCbQuery("Run a sim first"); } catch {}
    return;
  }

  const feePart = cur.annualFeePct > 0 ? ` fee ${cur.annualFeePct}` : "";
  const shockPart = cur.shockPct !== null && cur.shockYear !== null ? ` shock ${cur.shockPct} at ${cur.shockYear}` : "";
  const cmd = `/dca ${cur.weeklyAmount} ${cur.years} ${cur.annualReturnPct}${feePart}${shockPart}`;

  await ctx.reply(`Share:\nI ran $${formatMoney(cur.weeklyAmount)}/week for ${cur.years}y at ${cur.annualReturnPct}%${shockPart ? ` with a ${cur.shockPct}% shock in year ${cur.shockYear}` : ""}.\n\nCommand:\n${cmd}`);
  try { await ctx.answerCbQuery(); } catch {}
});

// Catch-all: if you type random text, it tells you the bot is alive
bot.on("text", async (ctx) => {
  const t = ctx.message?.text || "";
  if (t.startsWith("/")) return;
  await ctx.reply("Type /help or /dca 100 10 8");
});

bot.catch((err) => console.error("BOT ERROR:", err));

async function start() {
  // Important: makes long polling reliable on hosted services
  await bot.telegram.deleteWebhook().catch(() => {});
  await bot.launch();
  console.log("Bot running with long polling");
}

start();
