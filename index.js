import { Telegraf } from "telegraf";

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("Missing BOT_TOKEN env var");
}

const bot = new Telegraf(token);

// Simple per-user rate limit: 1 request / 2 seconds
const lastCall = new Map();
function isRateLimited(userId) {
  const now = Date.now();
  const last = lastCall.get(userId) || 0;
  if (now - last < 2000) return true;
  lastCall.set(userId, now);
  return false;
}

function toNum(x, fallback = null) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function weeklyRateFromAnnual(annualPct) {
  const a = annualPct / 100;
  if (a <= -1) return -1; // cap
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
  shockPct,     // e.g. -30
  shockYear     // e.g. 3
}) {
  const weeks = Math.max(0, Math.floor(years * 52));
  const rWeek = weeklyRateFromAnnual(annualReturnPct);
  const feeFactor = weeklyFeeFactorFromAnnual(annualFeePct);

  let portfolio = 0;
  let contributed = 0;

  let peak = 0;
  let maxDrawdown = 0; // negative number

  const series = [];
  let shockWeek = null;

  if (shockPct !== null && shockYear !== null) {
    const sYear = Math.max(0, Math.floor(shockYear));
    shockWeek = Math.min(weeks, Math.max(1, sYear * 52));
  }

  let preShockPeak = null;
  let recoveryWeeks = null;
  let afterShockCounter = 0;
  let shockApplied = false;

  for (let w = 1; w <= weeks; w++) {
    portfolio += weeklyAmount;
    contributed += weeklyAmount;

    portfolio *= (1 + rWeek);
    portfolio *= feeFactor;

    if (shockWeek !== null && w === shockWeek) {
      // record peak before shock for recovery calc
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
      if (portfolio >= preShockPeak) {
        recoveryWeeks = afterShockCounter;
      }
    }

    series.push(portfolio);
  }

  const finalValue = portfolio;
  const gains = finalValue - contributed;

  return {
    finalValue,
    contributed,
    gains,
    maxDrawdownPct: maxDrawdown * 100,
    recoveryWeeks,
    weeks,
    series,
    shockWeek
  };
}

function formatMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function parseDcaCommand(text) {
  // /dca 100 10 8 fee 0.2 shock -30 at 3
  const parts = text.trim().split(/\s+/);

  // parts[0] is /dca
  let weeklyAmount = 100;
  let years = 10;
  let annualReturnPct = 7;
  let annualFeePct = 0;

  let shockPct = null;
  let shockYear = null;

  if (parts.length >= 2) weeklyAmount = toNum(parts[1], 100);
  if (parts.length >= 3) years = toNum(parts[2], 10);
  if (parts.length >= 4) annualReturnPct = toNum(parts[3], 7);

  // scan optional tokens
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

  // guardrails
  weeklyAmount = Math.max(0, weeklyAmount);
  years = Math.min(50, Math.max(0, years));
  annualReturnPct = Math.min(200, Math.max(-100, annualReturnPct));
  annualFeePct = Math.min(5, Math.max(0, annualFeePct)); // keep sane for a fun tool

  if (shockPct !== null) shockPct = Math.min(0, Math.max(-95, shockPct)); // shock is a drawdown
  if (shockYear !== null) shockYear = Math.min(years, Math.max(0, shockYear));

  return { weeklyAmount, years, annualReturnPct, annualFeePct, shockPct, shockYear };
}

function quickChartUrl(series) {
  // Keep payload short by sampling weekly points
  const maxPoints = 260; // 5 years weekly if you want, but we sample anyway
  const step = Math.max(1, Math.floor(series.length / maxPoints));
  const sampled = [];
  for (let i = 0; i < series.length; i += step) sampled.push(Math.round(series[i]));

  const cfg = {
    type: "line",
    data: {
      labels: sampled.map((_, i) => i),
      datasets: [{ data: sampled, fill: false, pointRadius: 0, borderWidth: 2 }]
    },
    options: {
      legend: { display: false },
      scales: {
        xAxes: [{ display: false }],
        yAxes: [{ ticks: { callback: (v) => v.toLocaleString() } }]
      }
    }
  };

  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return `https://quickchart.io/chart?c=${encoded}&w=900&h=500&backgroundColor=white`;
}

function buildReply(params, result) {
  const lines = [];
  lines.push(`Weekly: $${formatMoney(params.weeklyAmount)} | Years: ${params.years} | Return: ${params.annualReturnPct}%`);
  if (params.annualFeePct > 0) lines.push(`Fee: ${params.annualFeePct}% / year`);
  lines.push(`Contributed: $${formatMoney(result.contributed)}`);
  lines.push(`Final: $${formatMoney(result.finalValue)}`);
  lines.push(`Gains: $${formatMoney(result.gains)}`);
  lines.push(`Max drawdown: ${result.maxDrawdownPct.toFixed(1)}%`);

  if (params.shockPct !== null && params.shockYear !== null) {
    const rec = result.recoveryWeeks === null ? "not reached" : `${result.recoveryWeeks} weeks`;
    lines.push(`Shock: ${params.shockPct}% at year ${params.shockYear} | Recovery: ${rec}`);
  }

  lines.push("");
  lines.push("Try: /dca 100 10 8 shock -30 at 3");
  lines.push("Presets: /base  /bull  /pain");
  return lines.join("\n");
}

bot.start((ctx) => {
  ctx.reply("DCA Shock Bot. Type /help");
});

bot.command("help", (ctx) => {
  const msg = [
    "Usage:",
    "/dca <weekly> <years> <annual_return> [fee <annual_fee>] [shock <shock_pct> at <shock_year>]",
    "",
    "Examples:",
    "/dca 100 10 8",
    "/dca 100 10 8 fee 0.2",
    "/dca 100 10 8 shock -30 at 3",
    "/dca 100 10 8 fee 0.2 shock -30 at 3",
    "",
    "Presets:",
    "/base  (7% with -30% at year 3)",
    "/bull  (12% no shock)",
    "/pain  (7% with -50% at year 2)"
  ].join("\n");
  ctx.reply(msg);
});

bot.command("base", async (ctx) => {
  const userId = ctx.from?.id;
  if (userId && isRateLimited(userId)) return;

  const params = { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -30, shockYear: 3 };
  const result = simulateDCA(params);
  await ctx.reply(buildReply(params, result));
  await ctx.replyWithPhoto(quickChartUrl(result.series));
});

bot.command("bull", async (ctx) => {
  const userId = ctx.from?.id;
  if (userId && isRateLimited(userId)) return;

  const params = { weeklyAmount: 100, years: 10, annualReturnPct: 12, annualFeePct: 0, shockPct: null, shockYear: null };
  const result = simulateDCA(params);
  await ctx.reply(buildReply(params, result));
  await ctx.replyWithPhoto(quickChartUrl(result.series));
});

bot.command("pain", async (ctx) => {
  const userId = ctx.from?.id;
  if (userId && isRateLimited(userId)) return;

  const params = { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -50, shockYear: 2 };
  const result = simulateDCA(params);
  await ctx.reply(buildReply(params, result));
  await ctx.replyWithPhoto(quickChartUrl(result.series));
});

bot.command("dca", async (ctx) => {
  const userId = ctx.from?.id;
  if (userId && isRateLimited(userId)) return;

  const text = ctx.message?.text || "";
  try {
    const params = parseDcaCommand(text);
    const result = simulateDCA(params);

    await ctx.reply(buildReply(params, result));
    await ctx.replyWithPhoto(quickChartUrl(result.series));
  } catch (e) {
    await ctx.reply("Could not parse. Type /help for examples.");
  }
});

bot.launch();
console.log("Bot running with long polling");
