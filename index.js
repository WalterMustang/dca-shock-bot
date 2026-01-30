// index.js
import { Telegraf, Markup } from "telegraf";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Missing BOT_TOKEN env var");

const bot = new Telegraf(token);

// Optional: comment out if you do not want logs
bot.use(async (ctx, next) => {
  const txt = ctx.message?.text;
  if (txt) console.log("IN:", txt);
  return next();
});

// In-memory state per user (no database)
const userState = new Map();

// Simple per-user rate limit (button spam protection)
const lastCall = new Map();
function isRateLimited(userId, ms = 900) {
  const now = Date.now();
  const last = lastCall.get(userId) || 0;
  if (now - last < ms) return true;
  lastCall.set(userId, now);
  return false;
}

// MarkdownV2 escape for captions
function escMdV2(s) {
  return String(s).replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
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
  // /dca <weekly> <years> <annual_return> [fee <annual_fee>] [shock <shock_pct> at <shock_year>]
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

function makeAppleishQuickChartUrl(series) {
  // Sample to keep URL size reasonable
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
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "DCA Projection",
          font: { size: 18, weight: "600" },
          padding: { top: 6, bottom: 10 }
        }
      },
      layout: { padding: 18 },
      scales: {
        x: {
          display: false,
          grid: { display: false }
        },
        y: {
          grid: { color: "rgba(0,0,0,0.06)" },
          ticks: {
            callback: (v) => Number(v).toLocaleString()
          }
        }
      }
    }
  };

  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return `https://quickchart.io/chart?c=${encoded}&w=980&h=560&backgroundColor=white`;
}

function buildCaption(sim) {
  const p = sim.params;
  const lines = [];

  lines.push(`*${escMdV2("DCA Shock Bot")}*`);
  lines.push(escMdV2(`Weekly: $${formatMoney(p.weeklyAmount)} | Years: ${p.years} | Return: ${p.annualReturnPct}%`));

  const meta = [];
  if (p.annualFeePct > 0) meta.push(`Fee: ${p.annualFeePct}%`);
  if (p.shockPct !== null && p.shockYear !== null) meta.push(`Shock: ${p.shockPct}% @ year ${p.shockYear}`);
  if (meta.length === 0) meta.push("Shock: off");
  lines.push(escMdV2(meta.join(" | ")));

  lines.push("");
  lines.push(escMdV2(`Contributed: $${formatMoney(sim.contributed)}`));
  lines.push(escMdV2(`Final: $${formatMoney(sim.finalValue)}`));
  lines.push(escMdV2(`Gains: $${formatMoney(sim.gains)}`));
  lines.push(escMdV2(`Max drawdown: ${sim.maxDrawdownPct.toFixed(1)}%`));

  if (p.shockPct !== null && p.shockYear !== null) {
    const rec = sim.recoveryWeeks === null ? "not reached" : `${sim.recoveryWeeks} weeks`;
    lines.push(escMdV2(`Recovery: ${rec}`));
  }

  return lines.join("\n");
}

function keyboardFor(p) {
  const shockOn = p.shockPct !== null && p.shockYear !== null;

  const rows = [
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
  ];

  return Markup.inlineKeyboard(rows);
}

async function renderCard(ctx, userId, params) {
  const p = clampParams(params);
  userState.set(userId, p);

  const sim = simulateDCA(p);
  const chartUrl = makeAppleishQuickChartUrl(sim.series);
  const caption = buildCaption(sim);
  const kb = keyboardFor(p);

  // One photo message with caption + buttons
  if (ctx.updateType === "callback_query") {
    try {
      await ctx.editMessageMedia(
        { type: "photo", media: chartUrl, caption, parse_mode: "MarkdownV2" },
        { reply_markup: kb.reply_markup }
      );
    } catch (e) {
      // If edit fails (message too old etc), send a new one
      await ctx.replyWithPhoto(chartUrl, {
        caption,
        parse_mode: "MarkdownV2",
        reply_markup: kb.reply_markup
      });
    }
    try {
      await ctx.answerCbQuery();
    } catch {}
    return;
  }

  await ctx.replyWithPhoto(chartUrl, {
    caption,
    parse_mode: "MarkdownV2",
    reply_markup: kb.reply_markup
  });
}

// Commands
bot.start(async (ctx) => {
  const msg =
    "DCA Shock Bot\n\n" +
    "Try /dca 100 10 8\n" +
    "Or type /help\n\n" +
    "Presets: /base /bull /pain";
  await ctx.reply(msg);
});

bot.command("help", async (ctx) => {
  const msg =
    "Usage:\n" +
    "/dca <weekly> <years> <annual_return> [fee <annual_fee>] [shock <shock_pct> at <shock_year>]\n\n" +
    "Examples:\n" +
    "/dca 100 10 8\n" +
    "/dca 100 10 8 shock -30 at 3\n" +
    "/dca 100 10 8 fee 0.2 shock -30 at 3\n\n" +
    "Tap presets below or run a command.";
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

  const params = parseDcaCommand(ctx.message?.text || "/dca");
  await renderCard(ctx, userId, params);
});

bot.command("base", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  await renderCard(ctx, userId, {
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 7,
    annualFeePct: 0,
    shockPct: -30,
    shockYear: 3
  });
});

bot.command("bull", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  await renderCard(ctx, userId, {
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 12,
    annualFeePct: 0,
    shockPct: null,
    shockYear: null
  });
});

bot.command("pain", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  await renderCard(ctx, userId, {
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 7,
    annualFeePct: 0,
    shockPct: -50,
    shockYear: 2
  });
});

// Button actions
bot.action("noop", async (ctx) => {
  try {
    await ctx.answerCbQuery("Turn shock on first");
  } catch {}
});

bot.action("run:default", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await renderCard(ctx, userId, {
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 7,
    annualFeePct: 0,
    shockPct: -30,
    shockYear: 3
  });
});

bot.action(/^preset:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const which = ctx.match[1];
  if (which === "base") {
    return renderCard(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -30, shockYear: 3 });
  }
  if (which === "bull") {
    return renderCard(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 12, annualFeePct: 0, shockPct: null, shockYear: null });
  }
  if (which === "pain") {
    return renderCard(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -50, shockYear: 2 });
  }
  try {
    await ctx.answerCbQuery();
  } catch {}
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

  if (shockOn) {
    await renderCard(ctx, userId, { ...cur, shockPct: null, shockYear: null });
  } else {
    await renderCard(ctx, userId, { ...cur, shockPct: -30, shockYear: Math.min(cur.years || 10, 3) });
  }
});

bot.action(/^shockyear:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, 350)) return;

  const cur = userState.get(userId);
  if (!cur || cur.shockPct === null || cur.shockYear === null) {
    try {
      await ctx.answerCbQuery("Turn shock on first");
    } catch {}
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
    try {
      await ctx.answerCbQuery("Run a sim first");
    } catch {}
    return;
  }

  const feePart = cur.annualFeePct > 0 ? ` fee ${cur.annualFeePct}` : "";
  const shockPart = cur.shockPct !== null && cur.shockYear !== null ? ` shock ${cur.shockPct} at ${cur.shockYear}` : "";
  const cmd = `/dca ${cur.weeklyAmount} ${cur.years} ${cur.annualReturnPct}${feePart}${shockPart}`;

  const line =
    `I ran $${formatMoney(cur.weeklyAmount)}/week for ${cur.years}y at ${cur.annualReturnPct}%` +
    (shockPart ? ` with a ${cur.shockPct}% shock in year ${cur.shockYear}` : "") +
    ".";

  await ctx.reply(`${line}\n\nCommand:\n${cmd}`);

  try {
    await ctx.answerCbQuery();
  } catch {}
});

// Catch errors so the bot does not silently die
bot.catch((err) => {
  console.error("BOT ERROR:", err);
});

bot.launch();
console.log("Bot running with long polling");
