import { Telegraf, Markup } from "telegraf";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Missing BOT_TOKEN env var");

const bot = new Telegraf(token);

// In memory per user state
const userState = new Map();

// Simple per user rate limit
const lastCall = new Map();
function rateLimited(userId) {
  const now = Date.now();
  const last = lastCall.get(userId) || 0;
  if (now - last < 1200) return true;
  lastCall.set(userId, now);
  return false;
}

// MarkdownV2 escape for captions
function esc(s) {
  return String(s).replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

function toNum(x, fallback = null) {
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

function simulateDCA({
  weeklyAmount,
  years,
  annualReturnPct,
  annualFeePct,
  shockPct,
  shockYear
}) {
  const weeks = Math.max(0, Math.floor(years * 52));
  const rWeek = weeklyRateFromAnnual(annualReturnPct);
  const feeFactor = weeklyFeeFactorFromAnnual(annualFeePct);

  let portfolio = 0;
  let contributed = 0;

  let peak = 0;
  let maxDrawdown = 0;

  const series = [];

  let shockWeek = null;
  if (shockPct !== null && shockYear !== null) {
    const sYear = Math.max(0, Math.floor(shockYear));
    shockWeek = Math.min(weeks, Math.max(1, sYear * 52));
  }

  let preShockPeak = null;
  let recoveryWeeks = null;
  let shockApplied = false;
  let afterShockCounter = 0;

  for (let w = 1; w <= weeks; w++) {
    portfolio += weeklyAmount;
    contributed += weeklyAmount;

    portfolio *= (1 + rWeek);
    portfolio *= feeFactor;

    if (shockWeek !== null && w === shockWeek) {
      preShockPeak = peak > 0 ? peak : portfolio;
      portfolio *= (1 + shockPct / 100);
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
    finalValue: portfolio,
    contributed,
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

function clampParams(p) {
  const out = { ...p };

  out.weeklyAmount = Math.max(0, out.weeklyAmount ?? 100);
  out.years = Math.min(50, Math.max(0, out.years ?? 10));
  out.annualReturnPct = Math.min(200, Math.max(-100, out.annualReturnPct ?? 7));
  out.annualFeePct = Math.min(5, Math.max(0, out.annualFeePct ?? 0));

  if (out.shockPct === null || out.shockYear === null) {
    out.shockPct = null;
    out.shockYear = null;
  } else {
    out.shockPct = Math.min(0, Math.max(-95, out.shockPct));
    out.shockYear = Math.min(out.years, Math.max(0, out.shockYear));
  }

  return out;
}

// Apple-ish chart config
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
          fill: false,
          borderWidth: 3,
          pointRadius: 0,
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
          font: { size: 18, weight: "600", family: "Helvetica, Arial, sans-serif" },
          padding: { top: 8, bottom: 12 }
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

function buildCaption(params, result) {
  const lines = [];
  lines.push(`*${esc("DCA Shock Bot")}*`);
  lines.push(`${esc(`Weekly: $${formatMoney(params.weeklyAmount)} | Years: ${params.years} | Return: ${params.annualReturnPct}%`)}`);
  if (params.annualFeePct > 0) lines.push(`${esc(`Fee: ${params.annualFeePct}% / year`)}`);

  if (params.shockPct !== null && params.shockYear !== null) {
    const rec = result.recoveryWeeks === null ? "not reached" : `${result.recoveryWeeks} weeks`;
    lines.push(`${esc(`Shock: ${params.shockPct}% at year ${params.shockYear} | Recovery: ${rec}`)}`);
  } else {
    lines.push(`${esc("Shock: off")}`);
  }

  lines.push("");
  lines.push(`${esc(`Contributed: $${formatMoney(result.contributed)}`)}`);
  lines.push(`${esc(`Final: $${formatMoney(result.finalValue)}`)}`);
  lines.push(`${esc(`Gains: $${formatMoney(result.gains)}`)}`);
  lines.push(`${esc(`Max drawdown: ${result.maxDrawdownPct.toFixed(1)}%`)}`);

  return lines.join("\n");
}

function buildKeyboard(params) {
  const shockOn = params.shockPct !== null && params.shockYear !== null;

  const rows = [
    [
      Markup.button.callback("Years -1", "years:-1"),
      Markup.button.callback("Years +1", "years:+1"),
      Markup.button.callback("Return -2%", "ret:-2"),
      Markup.button.callback("Return +2%", "ret:+2")
    ],
    [
      Markup.button.callback(shockOn ? "Shock: ON" : "Shock: OFF", "shock:toggle"),
      Markup.button.callback("Shock year -1", "shockyear:-1"),
      Markup.button.callback("Shock year +1", "shockyear:+1")
    ],
    [
      Markup.button.callback("Base", "preset:base"),
      Markup.button.callback("Bull", "preset:bull"),
      Markup.button.callback("Pain", "preset:pain"),
      Markup.button.callback("Share", "share")
    ]
  ];

  // If shock is off, disable shock year buttons visually by replacing callback with noop
  if (!shockOn) {
    rows[1][1] = Markup.button.callback("Shock year -1", "noop");
    rows[1][2] = Markup.button.callback("Shock year +1", "noop");
  }

  return Markup.inlineKeyboard(rows);
}

async function render(ctx, userId, params) {
  const safe = clampParams(params);
  userState.set(userId, safe);

  const result = simulateDCA(safe);
  const caption = buildCaption(safe, result);
  const chart = quickChartUrl(result.series);
  const keyboard = buildKeyboard(safe);

  // If this is a callback, edit in place. Otherwise send new.
  if (ctx.updateType === "callback_query") {
    try {
      await ctx.editMessageMedia(
        { type: "photo", media: chart, caption, parse_mode: "MarkdownV2" },
        { reply_markup: keyboard.reply_markup }
      );
    } catch {
      // Fallback: if edit fails (message too old etc), send a new one
      await ctx.replyWithPhoto(chart, { caption, parse_mode: "MarkdownV2", ...keyboard });
    }
    await ctx.answerCbQuery();
  } else {
    await ctx.replyWithPhoto(chart, { caption, parse_mode: "MarkdownV2", ...keyboard });
  }
}

function parseDca(text) {
  const parts = text.trim().split(/\s+/);

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
      }
    }
  }

  return { weeklyAmount, years, annualReturnPct, annualFeePct, shockPct, shockYear };
}

// Commands
bot.command("help", async (ctx) => {
  const msg =
    "Try:\n" +
    "/dca 100 10 8\n" +
    "/dca 100 10 8 shock -30 at 3\n" +
    "/dca 100 10 8 fee 0.2 shock -30 at 3\n\n" +
    "Or tap presets: /base /bull /pain";
  await ctx.reply(msg);
});

bot.command("dca", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (rateLimited(userId)) return;

  const params = parseDca(ctx.message?.text || "/dca");
  await render(ctx, userId, params);
});

bot.command("base", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (rateLimited(userId)) return;
  await render(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -30, shockYear: 3 });
});

bot.command("bull", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (rateLimited(userId)) return;
  await render(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 12, annualFeePct: 0, shockPct: null, shockYear: null });
});

bot.command("pain", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (rateLimited(userId)) return;
  await render(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -50, shockYear: 2 });
});

// Button handlers
bot.action("noop", async (ctx) => {
  await ctx.answerCbQuery("Turn shock on first");
});

bot.action(/^preset:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const which = ctx.match[1];
  if (which === "base") return render(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -30, shockYear: 3 });
  if (which === "bull") return render(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 12, annualFeePct: 0, shockPct: null, shockYear: null });
  if (which === "pain") return render(ctx, userId, { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -50, shockYear: 2 });

  await ctx.answerCbQuery();
});

bot.action(/^years:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cur = userState.get(userId) || { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: null, shockYear: null };
  const delta = Number(ctx.match[1]);
  await render(ctx, userId, { ...cur, years: (cur.years || 0) + delta });
});

bot.action(/^ret:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cur = userState.get(userId) || { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: null, shockYear: null };
  const delta = Number(ctx.match[1]);
  await render(ctx, userId, { ...cur, annualReturnPct: (cur.annualReturnPct || 0) + delta });
});

bot.action("shock:toggle", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cur = userState.get(userId) || { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: null, shockYear: null };

  const shockOn = cur.shockPct !== null && cur.shockYear !== null;
  if (shockOn) {
    await render(ctx, userId, { ...cur, shockPct: null, shockYear: null });
  } else {
    // default shock
    await render(ctx, userId, { ...cur, shockPct: -30, shockYear: Math.min(cur.years || 10, 3) });
  }
});

bot.action(/^shockyear:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cur = userState.get(userId);
  if (!cur || cur.shockPct === null || cur.shockYear === null) {
    await ctx.answerCbQuery("Turn shock on first");
    return;
  }
  const delta = Number(ctx.match[1]);
  await render(ctx, userId, { ...cur, shockYear: (cur.shockYear || 0) + delta });
});

bot.action("share", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cur = userState.get(userId);
  if (!cur) {
    await ctx.answerCbQuery("Run a sim first");
    return;
  }

  const shockPart = cur.shockPct !== null && cur.shockYear !== null ? ` shock ${cur.shockPct} at ${cur.shockYear}` : "";
  const feePart = cur.annualFeePct > 0 ? ` fee ${cur.annualFeePct}` : "";
  const cmd = `/dca ${cur.weeklyAmount} ${cur.years} ${cur.annualReturnPct}${feePart}${shockPart}`;

  await ctx.reply(
    `Share text:\n` +
    `I ran $${formatMoney(cur.weeklyAmount)}/week for ${cur.years}y at ${cur.annualReturnPct}%${shockPart ? ` with a ${cur.shockPct}% shock in year ${cur.shockYear}` : ""}.\n` +
    `Command:\n${cmd}`
  );

  await ctx.answerCbQuery();
});

bot.launch();
console.log("Bot running with long polling");
