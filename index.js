// index.js (CommonJS, Railway-friendly, interactive buttons, Apple-ish chart, with fallbacks)

const { Telegraf, Markup } = require("telegraf");

// Export core functions for testing (when required as module)
const isTestMode = process.env.NODE_ENV === "test";

// Initialize bot (skip token validation in test mode)
const token = process.env.BOT_TOKEN || (isTestMode ? "test-token" : null);
if (!token) throw new Error("Missing BOT_TOKEN env var");

const bot = new Telegraf(token);

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Presets
// ─────────────────────────────────────────────────────────────────────────────

const PRESETS = {
  base: { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -30, shockYear: 3 },
  bull: { weeklyAmount: 100, years: 10, annualReturnPct: 12, annualFeePct: 0, shockPct: null, shockYear: null },
  pain: { weeklyAmount: 100, years: 10, annualReturnPct: 7, annualFeePct: 0, shockPct: -50, shockYear: 2 }
};

// ETF presets with historical average returns (based on long-term data)
const ETF_PRESETS = {
  voo: {
    name: "VOO",
    fullName: "S&P 500 ETF (Vanguard)",
    annualReturnPct: 10.5,
    annualFeePct: 0.03,
    description: "Top 500 US companies (Apple, Microsoft, Amazon...). Most popular for passive investing.",
    typicalShock: -35  // 2008 crisis, 2020 COVID
  },
  qqq: {
    name: "QQQ",
    fullName: "Nasdaq 100 ETF",
    annualReturnPct: 14,
    annualFeePct: 0.2,
    description: "Top 100 tech companies. Higher returns but more volatile (dot-com crash was -80%).",
    typicalShock: -50  // 2000 dot-com, 2022 tech crash
  },
  vti: {
    name: "VTI",
    fullName: "Total US Stock Market",
    annualReturnPct: 10,
    annualFeePct: 0.03,
    description: "All ~4000 US stocks (large + mid + small cap). Maximum diversification.",
    typicalShock: -35
  },
  vxus: {
    name: "VXUS",
    fullName: "International Stocks",
    annualReturnPct: 5,
    annualFeePct: 0.08,
    description: "Stocks outside USA (Europe, Asia, emerging markets). Diversifies away from US.",
    typicalShock: -40
  },
  bnd: {
    name: "BND",
    fullName: "US Bond Fund",
    annualReturnPct: 4,
    annualFeePct: 0.03,
    description: "US government & corporate bonds. Low risk, low return. Good for stability.",
    typicalShock: -10
  },
  btc: {
    name: "BTC",
    fullName: "Bitcoin",
    annualReturnPct: 50,
    annualFeePct: 0,
    description: "Cryptocurrency. Extreme volatility - can 10x or drop 80%. High risk/reward.",
    typicalShock: -70
  }
};

const DEFAULTS = {
  weeklyAmount: 100,
  years: 10,
  annualReturnPct: 7,
  annualFeePct: 0,
  shockPct: null,
  shockYear: null,
  frequency: "weekly",  // "weekly" or "monthly"
  inflationPct: 3       // for real return calculation
};

const LIMITS = {
  weeklyAmount: { min: 0, max: 1_000_000 },
  years: { min: 0, max: 50 },
  annualReturnPct: { min: -100, max: 200 },
  annualFeePct: { min: 0, max: 5 },
  shockPct: { min: -95, max: 0 },
  inflationPct: { min: 0, max: 20 }
};

const RATE_LIMIT = {
  command: 900,
  button: 350,
  cleanupInterval: 60_000,
  maxAge: 300_000
};

// Log incoming messages (debug)
bot.use(async (ctx, next) => {
  const txt = ctx.message?.text;
  if (txt) console.log("IN:", txt);
  return next();
});

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<number, object>} In-memory state per user */
const userState = new Map();

/** @type {Map<number, number>} Last call timestamp per user for rate limiting */
const lastCall = new Map();

/**
 * Check if user is rate limited and update their last call timestamp
 * @param {number} userId - Telegram user ID
 * @param {number} ms - Minimum milliseconds between calls
 * @returns {boolean} True if rate limited
 */
function isRateLimited(userId, ms = RATE_LIMIT.command) {
  const now = Date.now();
  const last = lastCall.get(userId) || 0;
  if (now - last < ms) return true;
  lastCall.set(userId, now);
  return false;
}

/**
 * Periodically clean up stale entries from Maps to prevent memory leaks
 */
function cleanupStaleSessions() {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, timestamp] of lastCall.entries()) {
    if (now - timestamp > RATE_LIMIT.maxAge) {
      lastCall.delete(userId);
      userState.delete(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} stale session(s)`);
  }
}

// Run cleanup periodically
const cleanupTimer = setInterval(cleanupStaleSessions, RATE_LIMIT.cleanupInterval);

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape HTML special characters for Telegram captions
 * @param {string} s - String to escape
 * @returns {string} HTML-escaped string
 */
function escHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Convert value to number with fallback
 * @param {any} x - Value to convert
 * @param {number} fallback - Fallback if conversion fails
 * @returns {number} Converted number or fallback
 */
function toNum(x, fallback) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum bound
 * @param {number} max - Maximum bound
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial Calculations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert annual return percentage to weekly compound rate
 * @param {number} annualPct - Annual return percentage (e.g., 7 for 7%)
 * @returns {number} Weekly rate as decimal
 */
function weeklyRateFromAnnual(annualPct) {
  const a = annualPct / 100;
  if (a <= -1) return -1;
  return Math.pow(1 + a, 1 / 52) - 1;
}

/**
 * Convert annual fee percentage to weekly fee factor
 * @param {number} feePct - Annual fee percentage (e.g., 0.5 for 0.5%)
 * @returns {number} Weekly multiplier (e.g., 0.9999 for small fees)
 */
function weeklyFeeFactorFromAnnual(feePct) {
  const f = feePct / 100;
  if (f <= 0) return 1;
  if (f >= 1) return 0;
  return Math.pow(1 - f, 1 / 52);
}

/**
 * Validate and clamp simulation parameters to safe ranges
 * @param {object} p - Raw parameters
 * @returns {object} Validated and clamped parameters
 */
function clampParams(p) {
  const out = { ...DEFAULTS, ...p };

  out.weeklyAmount = clamp(toNum(out.weeklyAmount, DEFAULTS.weeklyAmount), LIMITS.weeklyAmount.min, LIMITS.weeklyAmount.max);
  out.years = clamp(toNum(out.years, DEFAULTS.years), LIMITS.years.min, LIMITS.years.max);
  out.annualReturnPct = clamp(toNum(out.annualReturnPct, DEFAULTS.annualReturnPct), LIMITS.annualReturnPct.min, LIMITS.annualReturnPct.max);
  out.annualFeePct = clamp(toNum(out.annualFeePct, DEFAULTS.annualFeePct), LIMITS.annualFeePct.min, LIMITS.annualFeePct.max);

  const shockOn = out.shockPct !== null && out.shockYear !== null;
  if (!shockOn) {
    out.shockPct = null;
    out.shockYear = null;
  } else {
    out.shockPct = clamp(toNum(out.shockPct, -30), LIMITS.shockPct.min, LIMITS.shockPct.max);
    out.shockYear = clamp(toNum(out.shockYear, 3), 0, out.years);
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// DCA Simulation Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} SimulationResult
 * @property {object} params - The validated parameters used
 * @property {number} contributed - Total amount contributed
 * @property {number} finalValue - Final portfolio value
 * @property {number} gains - Total gains (finalValue - contributed)
 * @property {number} maxDrawdownPct - Maximum drawdown percentage
 * @property {number|null} recoveryWeeks - Weeks to recover from shock (null if not recovered)
 * @property {number[]} series - Weekly portfolio values for charting
 * @property {object} milestones - Portfolio value at year milestones
 * @property {number} inflationAdjusted - Final value adjusted for inflation
 */

/**
 * Run a DCA (Dollar Cost Averaging) simulation with optional shock event
 * @param {object} params - Simulation parameters
 * @param {number} params.weeklyAmount - Weekly/monthly contribution amount
 * @param {number} params.years - Investment duration in years
 * @param {number} params.annualReturnPct - Expected annual return percentage
 * @param {number} params.annualFeePct - Annual management fee percentage
 * @param {number|null} params.shockPct - Shock event percentage (negative)
 * @param {number|null} params.shockYear - Year when shock occurs
 * @param {string} params.frequency - "weekly" or "monthly"
 * @param {number} params.inflationPct - Annual inflation rate
 * @returns {SimulationResult} Simulation results
 */
function simulateDCA(params) {
  const p = clampParams(params);

  // Support both weekly and monthly contributions
  const isMonthly = p.frequency === "monthly";
  const periodsPerYear = isMonthly ? 12 : 52;
  const totalPeriods = Math.max(0, Math.floor(p.years * periodsPerYear));

  const rPeriod = isMonthly
    ? Math.pow(1 + p.annualReturnPct / 100, 1 / 12) - 1
    : weeklyRateFromAnnual(p.annualReturnPct);
  const feeFactor = isMonthly
    ? Math.pow(1 - p.annualFeePct / 100, 1 / 12)
    : weeklyFeeFactorFromAnnual(p.annualFeePct);

  let portfolio = 0;
  let contributed = 0;

  let peak = 0;
  let maxDrawdown = 0;

  const series = [];
  const milestones = {};

  let shockPeriod = null;
  if (p.shockPct !== null && p.shockYear !== null) {
    shockPeriod = Math.min(totalPeriods, Math.max(1, Math.floor(p.shockYear) * periodsPerYear));
  }

  let preShockPeak = null;
  let recoveryPeriods = null;
  let shockApplied = false;
  let afterShockCounter = 0;

  for (let period = 1; period <= totalPeriods; period++) {
    portfolio += p.weeklyAmount;
    contributed += p.weeklyAmount;

    portfolio *= 1 + rPeriod;
    if (feeFactor < 1) portfolio *= feeFactor;

    if (shockPeriod !== null && period === shockPeriod) {
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

    if (shockApplied && recoveryPeriods === null && preShockPeak !== null) {
      afterShockCounter += 1;
      if (portfolio >= preShockPeak) recoveryPeriods = afterShockCounter;
    }

    series.push(portfolio);

    // Record milestones at year boundaries
    const year = Math.floor(period / periodsPerYear);
    if (period === year * periodsPerYear && year > 0) {
      milestones[year] = portfolio;
    }
  }

  // Final milestone
  if (p.years > 0) {
    milestones[p.years] = portfolio;
  }

  // Calculate inflation-adjusted final value
  const inflationFactor = Math.pow(1 + (p.inflationPct || 3) / 100, p.years);
  const inflationAdjusted = portfolio / inflationFactor;

  // Convert recovery periods to weeks for display
  const recoveryWeeks = recoveryPeriods !== null
    ? (isMonthly ? recoveryPeriods * 4 : recoveryPeriods)
    : null;

  return {
    params: p,
    contributed,
    finalValue: portfolio,
    gains: portfolio - contributed,
    maxDrawdownPct: maxDrawdown * 100,
    recoveryWeeks,
    series,
    milestones,
    inflationAdjusted
  };
}

/**
 * Format a number as currency string
 * @param {number} x - Number to format
 * @returns {string} Formatted string (e.g., "1,234")
 */
function formatMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse /dca command text into simulation parameters
 * Format: /dca <weekly> <years> <annual_return> [fee <annual_fee>] [shock <shock_pct> at <shock_year>]
 * @param {string} text - Command text
 * @returns {object} Parsed and validated parameters
 */
function parseDcaCommand(text) {
  const parts = String(text || "").trim().split(/\s+/);

  let weeklyAmount = DEFAULTS.weeklyAmount;
  let years = DEFAULTS.years;
  let annualReturnPct = DEFAULTS.annualReturnPct;
  let annualFeePct = DEFAULTS.annualFeePct;

  let shockPct = null;
  let shockYear = null;

  if (parts.length >= 2) weeklyAmount = toNum(parts[1], DEFAULTS.weeklyAmount);
  if (parts.length >= 3) years = toNum(parts[2], DEFAULTS.years);
  if (parts.length >= 4) annualReturnPct = toNum(parts[3], DEFAULTS.annualReturnPct);

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

// ─────────────────────────────────────────────────────────────────────────────
// Chart Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate QuickChart URL for portfolio visualization
 * Uses Apple-ish minimalist line chart style
 * @param {number[]} series - Portfolio values over time
 * @returns {string} QuickChart URL
 */
function quickChartUrl(series) {
  const maxPoints = 100;
  const step = Math.max(1, Math.floor(series.length / maxPoints));
  const sampled = [];
  const labels = [];
  for (let i = 0; i < series.length; i += step) {
    sampled.push(Math.round(series[i]));
    labels.push("");
  }

  const cfg = {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Portfolio",
          data: sampled,
          pointRadius: 0,
          borderWidth: 3,
          borderColor: "#0066CC",
          backgroundColor: "rgba(0,102,204,0.2)",
          fill: true
        }
      ]
    },
    options: {
      legend: { display: false },
      title: {
        display: true,
        text: "DCA Portfolio Growth"
      },
      scales: {
        xAxes: [{ display: false }],
        yAxes: [{
          ticks: { beginAtZero: true },
          gridLines: { color: "rgba(0,0,0,0.1)" }
        }]
      }
    }
  };

  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return `https://quickchart.io/chart?c=${encoded}&w=600&h=400&bkg=white`;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate inline keyboard for parameter adjustment
 * @param {object} p - Current parameters
 * @returns {object} Telegraf Markup keyboard
 */
function keyboardFor(p) {
  const shockOn = p.shockPct !== null && p.shockYear !== null;

  return Markup.inlineKeyboard([
    [
      Markup.button.callback("$-50/wk", "amt:-50"),
      Markup.button.callback("$+50/wk", "amt:+50"),
      Markup.button.callback("Yrs -1", "years:-1"),
      Markup.button.callback("Yrs +1", "years:+1")
    ],
    [
      Markup.button.callback("-2%", "ret:-2"),
      Markup.button.callback("+2%", "ret:+2"),
      Markup.button.callback(shockOn ? `${p.shockPct}%` : "Shock", "shock:toggle"),
      Markup.button.callback(shockOn ? "Worse" : "--", shockOn ? "shockpct:-10" : "noop")
    ],
    [
      Markup.button.callback("VOO", "etf:voo"),
      Markup.button.callback("QQQ", "etf:qqq"),
      Markup.button.callback("VTI", "etf:vti"),
      Markup.button.callback("BTC", "etf:btc")
    ],
    [
      Markup.button.callback("Base", "preset:base"),
      Markup.button.callback("Bull", "preset:bull"),
      Markup.button.callback("Pain", "preset:pain"),
      Markup.button.callback("Share", "share")
    ],
    [
      Markup.button.callback("📚 ETFs", "showetf"),
      Markup.button.callback("❓ Help", "showhelp"),
      Markup.button.callback("✕ Close", "close")
    ]
  ]);
}

/**
 * Build HTML caption with simulation results
 * @param {SimulationResult} sim - Simulation results
 * @returns {string} HTML-formatted caption
 */
function buildCaption(sim) {
  const p = sim.params;

  const header = `<b>📈 DCA Shock Bot</b>`;
  const freqLabel = p.frequency === "monthly" ? "Monthly" : "Weekly";
  const line1 = escHtml(`${freqLabel}: $${formatMoney(p.weeklyAmount)} | Years: ${p.years} | Return: ${p.annualReturnPct}%`);

  const meta = [];
  if (p.annualFeePct > 0) meta.push(`Fee: ${p.annualFeePct}%`);
  if (p.shockPct !== null && p.shockYear !== null) meta.push(`Shock: ${p.shockPct}% @ year ${p.shockYear}`);
  if (meta.length === 0) meta.push("Shock: off");
  const line2 = escHtml(meta.join(" | "));

  // Calculate ROI percentage
  const roi = sim.contributed > 0 ? ((sim.gains / sim.contributed) * 100).toFixed(1) : "0.0";

  const stats = [
    `💰 Contributed: $${formatMoney(sim.contributed)}`,
    `📈 Final: $${formatMoney(sim.finalValue)}`,
    `✅ Gains: $${formatMoney(sim.gains)} (${roi}% ROI)`,
    `📉 Max drawdown: ${sim.maxDrawdownPct.toFixed(1)}%`
  ];

  // Add inflation-adjusted value
  if (sim.inflationAdjusted) {
    stats.push(`💵 After ${p.inflationPct || 3}% inflation: $${formatMoney(sim.inflationAdjusted)}`);
  }

  if (p.shockPct !== null && p.shockYear !== null) {
    const rec = sim.recoveryWeeks === null ? "not reached" : `${sim.recoveryWeeks} weeks`;
    stats.push(`🔄 Recovery: ${rec}`);
  }

  // Add milestones (show 3 key ones)
  if (sim.milestones && Object.keys(sim.milestones).length > 0) {
    const years = Object.keys(sim.milestones).map(Number).sort((a, b) => a - b);
    const keyYears = [];
    if (years.length <= 3) {
      keyYears.push(...years);
    } else {
      // Show first, middle, last
      keyYears.push(years[0]);
      keyYears.push(years[Math.floor(years.length / 2)]);
      keyYears.push(years[years.length - 1]);
    }
    const milestonesStr = keyYears
      .map(y => `Yr${y}: $${formatMoney(sim.milestones[y])}`)
      .join(" → ");
    stats.push(`📅 ${milestonesStr}`);
  }

  return [header, line1, line2, "", escHtml(stats.join("\n"))].join("\n");
}

function stripHtml(html) {
  return String(html).replace(/<[^>]*>/g, "");
}

async function renderCard(ctx, userId, params) {
  const p = clampParams(params);
  userState.set(userId, p);

  const sim = simulateDCA(p);
  const chart = quickChartUrl(sim.series);
  const caption = buildCaption(sim);
  const kb = keyboardFor(p);

  // Callback query: edit existing message if possible
  if (ctx.updateType === "callback_query") {
    try {
      await ctx.editMessageMedia(
        { type: "photo", media: chart, caption, parse_mode: "HTML" },
        { reply_markup: kb.reply_markup }
      );
    } catch (e) {
      console.error("EDIT MEDIA FAILED:", e);

      // Fallback: send new message
      try {
        await ctx.replyWithPhoto(chart, { caption, parse_mode: "HTML", reply_markup: kb.reply_markup });
      } catch (e2) {
        console.error("PHOTO SEND FAILED:", e2);
        await ctx.reply(stripHtml(caption), { reply_markup: kb.reply_markup });
        await ctx.reply(`Chart: ${chart}`);
      }
    }

    try {
      await ctx.answerCbQuery();
    } catch {}
    return;
  }

  // Normal command: send new message
  try {
    await ctx.replyWithPhoto(chart, { caption, parse_mode: "HTML", reply_markup: kb.reply_markup });
  } catch (e) {
    console.error("PHOTO SEND FAILED:", e);
    await ctx.reply(stripHtml(caption), { reply_markup: kb.reply_markup });
    await ctx.reply(`Chart: ${chart}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot Commands
// ─────────────────────────────────────────────────────────────────────────────

bot.start(async (ctx) => {
  const name = ctx.from?.first_name || "there";
  const msg =
    `👋 Hey ${name}! Welcome to <b>DCA Shock Bot</b>\n\n` +
    `📈 I help you visualize how <b>weekly investing</b> grows over time — and what happens when markets crash.\n\n` +
    `<b>What is DCA?</b>\n` +
    `Dollar Cost Averaging = investing a fixed amount every week/month, no matter the price. It's how most people build wealth.\n\n` +
    `<b>Try it now:</b>\n` +
    `→ Tap an ETF below to see a simulation\n` +
    `→ Or type: /dca 100 10 7 (= $100/week, 10 years, 7% return)\n\n` +
    `💡 <i>Tip: Use /etf to learn about different investment options</i>`;

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("🇺🇸 VOO (S&P 500)", "etf:voo"),
      Markup.button.callback("💻 QQQ (Tech)", "etf:qqq")
    ],
    [
      Markup.button.callback("🌍 VTI (Total US)", "etf:vti"),
      Markup.button.callback("₿ Bitcoin", "etf:btc")
    ],
    [
      Markup.button.callback("📚 What are ETFs?", "showetf"),
      Markup.button.callback("❓ Help", "showhelp")
    ]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

bot.action("showetf", async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}
  // Trigger the /etf command logic
  const userId = ctx.from?.id;
  if (!userId) return;

  let msg = "📈 <b>What are ETFs?</b>\n";
  msg += "ETFs (Exchange-Traded Funds) are baskets of stocks you can buy with one purchase. ";
  msg += "Instead of picking individual stocks, you buy the whole market.\n\n";
  msg += "<b>Popular ETFs for DCA investing:</b>\n\n";
  for (const [key, etf] of Object.entries(ETF_PRESETS)) {
    msg += `<b>/${key.toUpperCase()}</b> - ${etf.fullName}\n`;
    msg += `📊 ${etf.annualReturnPct}% avg | 💰 ${etf.annualFeePct}% fee | 📉 ${etf.typicalShock}% crash\n`;
    msg += `<i>${etf.description}</i>\n\n`;
  }
  msg += "⚠️ <i>Past performance ≠ future results.</i>";

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback("VOO", "etf:voo"), Markup.button.callback("QQQ", "etf:qqq"), Markup.button.callback("VTI", "etf:vti")],
    [Markup.button.callback("VXUS", "etf:vxus"), Markup.button.callback("BND", "etf:bnd"), Markup.button.callback("BTC", "etf:btc")],
    [Markup.button.callback("❓ Help", "showhelp"), Markup.button.callback("✕ Close", "close")]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

bot.action("showhelp", async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}
  const msg =
    "📊 <b>DCA Shock Bot - Help</b>\n\n" +
    "<b>Basic command:</b>\n" +
    "<code>/dca 100 10 8</code> = $100/week, 10 years, 8% return\n\n" +
    "<b>With market crash:</b>\n" +
    "<code>/dca 100 10 8 shock -30 at 3</code>\n= Same, but -30% crash at year 3\n\n" +
    "<b>Quick ETF simulations:</b>\n" +
    "/voo - S&P 500 (10.5% avg)\n" +
    "/qqq - Nasdaq Tech (14% avg)\n" +
    "/btc - Bitcoin (50% avg, very risky)\n\n" +
    "<b>Buttons:</b> Adjust values without retyping\n" +
    "<b>Share:</b> Export your results";

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback("▶️ Try VOO", "etf:voo"), Markup.button.callback("▶️ Try QQQ", "etf:qqq")],
    [Markup.button.callback("📚 ETFs", "showetf"), Markup.button.callback("✕ Close", "close")]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

bot.command("ping", async (ctx) => ctx.reply("pong"));

bot.command("help", async (ctx) => {
  const msg =
    "📊 <b>DCA Shock Bot - Help</b>\n\n" +
    "<b>Basic Commands:</b>\n" +
    "/dca 100 10 8 - $100/wk, 10yrs, 8%\n" +
    "/dca 100 10 8 shock -30 at 3\n" +
    "/monthly - Switch weekly↔monthly\n\n" +
    "<b>ETFs:</b>\n" +
    "/etf - Show all ETF presets\n" +
    "/voo /qqq /vti /btc - Quick simulate\n\n" +
    "<b>Tools:</b>\n" +
    "/goal 1000000 20 10 - How much to invest for $1M?\n" +
    "/compare voo qqq - Compare two ETFs\n\n" +
    "<b>ETF Returns:</b>\n" +
    "VOO 10.5% | QQQ 14% | VTI 10% | BTC 50%";
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback("🎯 Goal $1M", "goal:1000000"), Markup.button.callback("⚖️ VOO vs QQQ", "cmp:voo:qqq")],
    [Markup.button.callback("VOO", "etf:voo"), Markup.button.callback("QQQ", "etf:qqq"), Markup.button.callback("BTC", "etf:btc")],
    [Markup.button.callback("✕ Close", "close")]
  ]);
  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

bot.command("dca", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  try {
    const params = parseDcaCommand(ctx.message?.text || "/dca");
    await renderCard(ctx, userId, params);
  } catch (e) {
    console.error("DCA ERROR FULL:", e);
    await ctx.reply("Error running sim. Try /help");
  }
});

// Preset commands
bot.command("base", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;
  await renderCard(ctx, userId, PRESETS.base);
});

bot.command("bull", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;
  await renderCard(ctx, userId, PRESETS.bull);
});

bot.command("pain", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;
  await renderCard(ctx, userId, PRESETS.pain);
});

// Goal Calculator - reverse DCA: how much to invest to reach a goal
bot.command("goal", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  const args = (ctx.message?.text || "").trim().split(/\s+/);
  // /goal <target> <years> <return%>
  const target = toNum(args[1], 1000000);
  const years = toNum(args[2], 20);
  const annualReturn = toNum(args[3], 10);

  // Calculate required weekly contribution using future value of annuity formula
  // FV = PMT * [((1 + r)^n - 1) / r]
  // PMT = FV * r / ((1 + r)^n - 1)
  const weeks = years * 52;
  const weeklyRate = Math.pow(1 + annualReturn / 100, 1 / 52) - 1;

  let weeklyNeeded;
  if (weeklyRate === 0) {
    weeklyNeeded = target / weeks;
  } else {
    weeklyNeeded = target * weeklyRate / (Math.pow(1 + weeklyRate, weeks) - 1);
  }

  const monthlyNeeded = weeklyNeeded * 52 / 12;

  const msg =
    `🎯 <b>Goal Calculator</b>\n\n` +
    `Target: <b>$${formatMoney(target)}</b>\n` +
    `Timeline: <b>${years} years</b>\n` +
    `Expected return: <b>${annualReturn}%</b>\n\n` +
    `<b>You need to invest:</b>\n` +
    `💵 $${formatMoney(weeklyNeeded)}/week\n` +
    `💵 $${formatMoney(monthlyNeeded)}/month\n\n` +
    `<i>Tip: Try /dca ${Math.round(weeklyNeeded)} ${years} ${annualReturn} to simulate</i>`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback("▶️ Simulate this", `sim:${Math.round(weeklyNeeded)}:${years}:${annualReturn}`)],
    [Markup.button.callback("🎯 $500k goal", "goal:500000"), Markup.button.callback("🎯 $1M goal", "goal:1000000")],
    [Markup.button.callback("✕ Close", "close")]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

// Compare two ETFs/scenarios side by side
bot.command("compare", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  const args = (ctx.message?.text || "").trim().split(/\s+/);
  const etf1 = args[1]?.toLowerCase() || "voo";
  const etf2 = args[2]?.toLowerCase() || "qqq";

  const preset1 = ETF_PRESETS[etf1];
  const preset2 = ETF_PRESETS[etf2];

  if (!preset1 || !preset2) {
    await ctx.reply("Usage: /compare voo qqq\nAvailable: voo, qqq, vti, vxus, bnd, btc");
    return;
  }

  const cur = userState.get(userId) || clampParams({});
  const years = cur.years || 10;
  const amount = cur.weeklyAmount || 100;

  const sim1 = simulateDCA({ ...cur, annualReturnPct: preset1.annualReturnPct, annualFeePct: preset1.annualFeePct, shockPct: preset1.typicalShock, shockYear: 3 });
  const sim2 = simulateDCA({ ...cur, annualReturnPct: preset2.annualReturnPct, annualFeePct: preset2.annualFeePct, shockPct: preset2.typicalShock, shockYear: 3 });

  const roi1 = sim1.contributed > 0 ? ((sim1.gains / sim1.contributed) * 100).toFixed(1) : "0";
  const roi2 = sim2.contributed > 0 ? ((sim2.gains / sim2.contributed) * 100).toFixed(1) : "0";

  const winner = sim1.finalValue > sim2.finalValue ? preset1.name : preset2.name;
  const diff = Math.abs(sim1.finalValue - sim2.finalValue);

  const msg =
    `⚖️ <b>Compare: ${preset1.name} vs ${preset2.name}</b>\n` +
    `$${formatMoney(amount)}/week for ${years} years\n\n` +
    `<b>${preset1.name}</b> (${preset1.annualReturnPct}% return)\n` +
    `Final: $${formatMoney(sim1.finalValue)} | ROI: ${roi1}%\n` +
    `Drawdown: ${sim1.maxDrawdownPct.toFixed(1)}%\n\n` +
    `<b>${preset2.name}</b> (${preset2.annualReturnPct}% return)\n` +
    `Final: $${formatMoney(sim2.finalValue)} | ROI: ${roi2}%\n` +
    `Drawdown: ${sim2.maxDrawdownPct.toFixed(1)}%\n\n` +
    `🏆 <b>${winner}</b> wins by $${formatMoney(diff)}`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback(`▶️ ${preset1.name}`, `etf:${etf1}`), Markup.button.callback(`▶️ ${preset2.name}`, `etf:${etf2}`)],
    [Markup.button.callback("VOO vs BTC", "cmp:voo:btc"), Markup.button.callback("QQQ vs VTI", "cmp:qqq:vti")],
    [Markup.button.callback("✕ Close", "close")]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

// Monthly mode toggle
bot.command("monthly", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  const cur = userState.get(userId) || clampParams({});
  const newFreq = cur.frequency === "monthly" ? "weekly" : "monthly";
  await renderCard(ctx, userId, { ...cur, frequency: newFreq });
});

// Portfolio Mix - combine multiple ETFs
// Usage: /mix 60 voo 40 bnd OR /mix 70 voo 20 qqq 10 bnd
bot.command("mix", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  const args = (ctx.message?.text || "").trim().split(/\s+/).slice(1);

  // Parse pairs of: percentage etfname
  const allocations = [];
  let totalPct = 0;

  for (let i = 0; i < args.length; i += 2) {
    const pct = toNum(args[i], 0);
    const etfName = args[i + 1]?.toLowerCase();

    if (pct > 0 && etfName && ETF_PRESETS[etfName]) {
      allocations.push({ pct, etf: ETF_PRESETS[etfName], name: etfName });
      totalPct += pct;
    }
  }

  // Default to 60/40 VOO/BND if no valid input
  if (allocations.length === 0) {
    allocations.push({ pct: 60, etf: ETF_PRESETS.voo, name: "voo" });
    allocations.push({ pct: 40, etf: ETF_PRESETS.bnd, name: "bnd" });
    totalPct = 100;
  }

  // Normalize to 100% if needed
  if (totalPct !== 100) {
    const factor = 100 / totalPct;
    allocations.forEach(a => a.pct = Math.round(a.pct * factor));
  }

  // Calculate blended return, fee, and shock
  let blendedReturn = 0;
  let blendedFee = 0;
  let blendedShock = 0;

  allocations.forEach(a => {
    const weight = a.pct / 100;
    blendedReturn += a.etf.annualReturnPct * weight;
    blendedFee += a.etf.annualFeePct * weight;
    blendedShock += a.etf.typicalShock * weight;
  });

  blendedReturn = Math.round(blendedReturn * 10) / 10;
  blendedFee = Math.round(blendedFee * 100) / 100;
  blendedShock = Math.round(blendedShock);

  // Build allocation display
  const mixName = allocations.map(a => `${a.pct}% ${a.etf.name}`).join(" + ");
  const mixShort = allocations.map(a => `${a.pct}${a.name}`).join("-");

  // Run simulation
  const cur = userState.get(userId) || clampParams({});
  const sim = simulateDCA({
    ...cur,
    annualReturnPct: blendedReturn,
    annualFeePct: blendedFee,
    shockPct: blendedShock,
    shockYear: Math.min(cur.years || 10, 3)
  });

  const roi = sim.contributed > 0 ? ((sim.gains / sim.contributed) * 100).toFixed(1) : "0";

  const msg =
    `🎨 <b>Portfolio Mix</b>\n\n` +
    `<b>${mixName}</b>\n\n` +
    `📊 Blended return: ${blendedReturn}%\n` +
    `💰 Blended fee: ${blendedFee}%\n` +
    `📉 Blended crash: ${blendedShock}%\n\n` +
    `<b>Simulation (${cur.years || 10} years, $${formatMoney(cur.weeklyAmount || 100)}/wk):</b>\n` +
    `💵 Contributed: $${formatMoney(sim.contributed)}\n` +
    `📈 Final: $${formatMoney(sim.finalValue)}\n` +
    `✅ Gains: $${formatMoney(sim.gains)} (${roi}% ROI)\n` +
    `📉 Max drawdown: ${sim.maxDrawdownPct.toFixed(1)}%`;

  // Store the blended params for further adjustments
  userState.set(userId, {
    ...cur,
    annualReturnPct: blendedReturn,
    annualFeePct: blendedFee,
    shockPct: blendedShock,
    shockYear: Math.min(cur.years || 10, 3),
    _mixName: mixName
  });

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("$-50/wk", `mix:amt:-50:${mixShort}`),
      Markup.button.callback("$+50/wk", `mix:amt:+50:${mixShort}`),
      Markup.button.callback("Yrs -1", `mix:yrs:-1:${mixShort}`),
      Markup.button.callback("Yrs +1", `mix:yrs:+1:${mixShort}`)
    ],
    [Markup.button.callback("▶️ Full simulation", `mix:run:${mixShort}`)],
    [
      Markup.button.callback("60/40 VOO/BND", "mix:60voo-40bnd"),
      Markup.button.callback("80/20 VOO/BND", "mix:80voo-20bnd")
    ],
    [
      Markup.button.callback("70/30 VTI/VXUS", "mix:70vti-30vxus"),
      Markup.button.callback("50/50 VOO/QQQ", "mix:50voo-50qqq")
    ],
    [Markup.button.callback("🏠 Menu", "home")]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

// ETF commands - show list or simulate specific ETF
bot.command("etf", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId)) return;

  const args = (ctx.message?.text || "").trim().split(/\s+/);
  const etfName = args[1]?.toLowerCase();

  // If specific ETF requested
  if (etfName && ETF_PRESETS[etfName]) {
    const etf = ETF_PRESETS[etfName];
    const cur = userState.get(userId) || clampParams({});
    await renderCard(ctx, userId, {
      ...cur,
      annualReturnPct: etf.annualReturnPct,
      annualFeePct: etf.annualFeePct,
      shockPct: etf.typicalShock,
      shockYear: Math.min(cur.years || 10, 3)
    });
    return;
  }

  // Show ETF list with explanation
  let msg = "📈 <b>What are ETFs?</b>\n";
  msg += "ETFs (Exchange-Traded Funds) are baskets of stocks you can buy with one purchase. ";
  msg += "Instead of picking individual stocks, you buy the whole market.\n\n";
  msg += "<b>Popular ETFs for DCA investing:</b>\n\n";
  for (const [key, etf] of Object.entries(ETF_PRESETS)) {
    msg += `<b>/${key.toUpperCase()}</b> - ${etf.fullName}\n`;
    msg += `📊 ${etf.annualReturnPct}% avg return | 💰 ${etf.annualFeePct}% fee | 📉 ${etf.typicalShock}% typical crash\n`;
    msg += `<i>${etf.description}</i>\n\n`;
  }
  msg += "⚠️ <i>Past performance ≠ future results. This is for education only.</i>\n\n";
  msg += "👆 Tap an ETF to simulate:";

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("VOO", "etf:voo"),
      Markup.button.callback("QQQ", "etf:qqq"),
      Markup.button.callback("VTI", "etf:vti")
    ],
    [
      Markup.button.callback("VXUS", "etf:vxus"),
      Markup.button.callback("BND", "etf:bnd"),
      Markup.button.callback("BTC", "etf:btc")
    ],
    [
      Markup.button.callback("❓ Help", "showhelp"),
      Markup.button.callback("✕ Close", "close")
    ]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

// Individual ETF commands
for (const etfKey of Object.keys(ETF_PRESETS)) {
  bot.command(etfKey, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (isRateLimited(userId)) return;

    const etf = ETF_PRESETS[etfKey];
    const cur = userState.get(userId) || clampParams({});
    await renderCard(ctx, userId, {
      ...cur,
      annualReturnPct: etf.annualReturnPct,
      annualFeePct: etf.annualFeePct,
      shockPct: etf.typicalShock,
      shockYear: Math.min(cur.years || 10, 3)
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Button Actions
// ─────────────────────────────────────────────────────────────────────────────

bot.action("noop", async (ctx) => {
  try {
    await ctx.answerCbQuery("Turn shock on first");
  } catch {}
});

bot.action("close", async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}

  // Delete the current message and show home menu
  try { await ctx.deleteMessage(); } catch {}

  const name = ctx.from?.first_name || "there";
  const msg =
    `👋 Hey ${name}! Welcome to <b>DCA Shock Bot</b>\n\n` +
    `📈 I help you visualize how <b>weekly investing</b> grows over time — and what happens when markets crash.\n\n` +
    `<b>What is DCA?</b>\n` +
    `Dollar Cost Averaging = investing a fixed amount every week/month, no matter the price. It's how most people build wealth.\n\n` +
    `<b>Try it now:</b>\n` +
    `→ Tap an ETF below to see a simulation\n` +
    `→ Or type: /dca 100 10 7 (= $100/week, 10 years, 7% return)\n\n` +
    `💡 <i>Tip: Use /etf to learn about different investment options</i>`;

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("🇺🇸 VOO (S&P 500)", "etf:voo"),
      Markup.button.callback("💻 QQQ (Tech)", "etf:qqq")
    ],
    [
      Markup.button.callback("🌍 VTI (Total US)", "etf:vti"),
      Markup.button.callback("₿ Bitcoin", "etf:btc")
    ],
    [
      Markup.button.callback("🎨 Portfolio Mix", "mix:60voo-40bnd"),
      Markup.button.callback("🎯 Goals", "goal:1000000")
    ],
    [
      Markup.button.callback("📚 What are ETFs?", "showetf"),
      Markup.button.callback("❓ Help", "showhelp")
    ]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

bot.action("home", async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}
  const name = ctx.from?.first_name || "there";
  const msg =
    `👋 Hey ${name}! Welcome to <b>DCA Shock Bot</b>\n\n` +
    `📈 I help you visualize how <b>weekly investing</b> grows over time — and what happens when markets crash.\n\n` +
    `<b>What is DCA?</b>\n` +
    `Dollar Cost Averaging = investing a fixed amount every week/month, no matter the price. It's how most people build wealth.\n\n` +
    `<b>Try it now:</b>\n` +
    `→ Tap an ETF below to see a simulation\n` +
    `→ Or type: /dca 100 10 7 (= $100/week, 10 years, 7% return)\n\n` +
    `💡 <i>Tip: Use /etf to learn about different investment options</i>`;

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("🇺🇸 VOO (S&P 500)", "etf:voo"),
      Markup.button.callback("💻 QQQ (Tech)", "etf:qqq")
    ],
    [
      Markup.button.callback("🌍 VTI (Total US)", "etf:vti"),
      Markup.button.callback("₿ Bitcoin", "etf:btc")
    ],
    [
      Markup.button.callback("📚 What are ETFs?", "showetf"),
      Markup.button.callback("❓ Help", "showhelp")
    ]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

bot.action("run:default", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await renderCard(ctx, userId, PRESETS.base);
});

bot.action(/^preset:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const preset = PRESETS[ctx.match[1]];
  if (preset) {
    return renderCard(ctx, userId, preset);
  }

  try {
    await ctx.answerCbQuery();
  } catch {}
});

bot.action(/^etf:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, RATE_LIMIT.button)) return;

  const etfKey = ctx.match[1];
  const etf = ETF_PRESETS[etfKey];
  if (!etf) {
    try { await ctx.answerCbQuery("Unknown ETF"); } catch {}
    return;
  }

  const cur = userState.get(userId) || clampParams({});
  await renderCard(ctx, userId, {
    ...cur,
    annualReturnPct: etf.annualReturnPct,
    annualFeePct: etf.annualFeePct,
    shockPct: etf.typicalShock,
    shockYear: Math.min(cur.years || 10, 3)
  });
});

bot.action(/^years:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, RATE_LIMIT.button)) return;

  const cur = userState.get(userId) || clampParams({});
  const delta = Number(ctx.match[1]);
  await renderCard(ctx, userId, { ...cur, years: (cur.years || 0) + delta });
});

bot.action(/^ret:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, RATE_LIMIT.button)) return;

  const cur = userState.get(userId) || clampParams({});
  const delta = Number(ctx.match[1]);
  await renderCard(ctx, userId, { ...cur, annualReturnPct: (cur.annualReturnPct || 0) + delta });
});

bot.action(/^amt:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, RATE_LIMIT.button)) return;

  const cur = userState.get(userId) || clampParams({});
  const delta = Number(ctx.match[1]);
  await renderCard(ctx, userId, { ...cur, weeklyAmount: Math.max(0, (cur.weeklyAmount || 0) + delta) });
});

bot.action(/^shockpct:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, RATE_LIMIT.button)) return;

  const cur = userState.get(userId) || clampParams({});
  if (cur.shockPct === null) {
    try { await ctx.answerCbQuery("Turn shock on first"); } catch {}
    return;
  }
  const delta = Number(ctx.match[1]);
  const newShock = Math.max(-95, Math.min(0, (cur.shockPct || -30) + delta));
  await renderCard(ctx, userId, { ...cur, shockPct: newShock });
});

bot.action("shock:toggle", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, RATE_LIMIT.button)) return;

  const cur = userState.get(userId) || clampParams({});
  const shockOn = cur.shockPct !== null && cur.shockYear !== null;

  if (shockOn) return renderCard(ctx, userId, { ...cur, shockPct: null, shockYear: null });

  return renderCard(ctx, userId, { ...cur, shockPct: -30, shockYear: Math.min(cur.years || 10, 3) });
});

bot.action(/^shockyear:([+-]\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (isRateLimited(userId, RATE_LIMIT.button)) return;

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

  // Run simulation to get actual results
  const sim = simulateDCA(cur);
  const roi = sim.contributed > 0 ? ((sim.gains / sim.contributed) * 100).toFixed(1) : "0.0";

  const feePart = cur.annualFeePct > 0 ? ` fee ${cur.annualFeePct}` : "";
  const shockPart = cur.shockPct !== null && cur.shockYear !== null ? ` shock ${cur.shockPct} at ${cur.shockYear}` : "";
  const cmd = `/dca ${cur.weeklyAmount} ${cur.years} ${cur.annualReturnPct}${feePart}${shockPart}`;

  const freqLabel = cur.frequency === "monthly" ? "month" : "week";
  const shockInfo = cur.shockPct !== null ? ` with ${cur.shockPct}% crash` : "";

  // Twitter share text
  const tweetText = encodeURIComponent(
    `📈 If I invest $${formatMoney(cur.weeklyAmount)}/${freqLabel} for ${cur.years} years at ${cur.annualReturnPct}% return${shockInfo}:\n\n` +
    `💰 Final: $${formatMoney(sim.finalValue)}\n` +
    `✅ Gains: $${formatMoney(sim.gains)} (${roi}% ROI)\n\n` +
    `Try it: t.me/dcashockbot`
  );
  const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;

  const msg =
    `📊 <b>Share Your Simulation</b>\n\n` +
    `$${formatMoney(cur.weeklyAmount)}/${freqLabel} for ${cur.years} years at ${cur.annualReturnPct}%${shockInfo}\n\n` +
    `💰 Contributed: $${formatMoney(sim.contributed)}\n` +
    `📈 Final: $${formatMoney(sim.finalValue)}\n` +
    `✅ Gains: $${formatMoney(sim.gains)} (${roi}% ROI)\n` +
    `📉 Max Drawdown: ${sim.maxDrawdownPct.toFixed(1)}%\n\n` +
    `<b>Command:</b>\n<code>${cmd}</code>`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.url("🐦 Share on Twitter", twitterUrl)],
    [Markup.button.callback("✕ Close", "close")]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });

  try {
    await ctx.answerCbQuery();
  } catch {}
});

// Goal preset buttons
bot.action(/^goal:(\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  try { await ctx.answerCbQuery(); } catch {}

  const target = Number(ctx.match[1]);
  const years = 20;
  const annualReturn = 10;

  const weeks = years * 52;
  const weeklyRate = Math.pow(1 + annualReturn / 100, 1 / 52) - 1;
  const weeklyNeeded = target * weeklyRate / (Math.pow(1 + weeklyRate, weeks) - 1);
  const monthlyNeeded = weeklyNeeded * 52 / 12;

  const msg =
    `🎯 <b>Goal: $${formatMoney(target)}</b>\n\n` +
    `Timeline: <b>${years} years</b>\n` +
    `Expected return: <b>${annualReturn}%</b>\n\n` +
    `<b>You need to invest:</b>\n` +
    `💵 $${formatMoney(weeklyNeeded)}/week\n` +
    `💵 $${formatMoney(monthlyNeeded)}/month`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback("▶️ Simulate", `sim:${Math.round(weeklyNeeded)}:${years}:${annualReturn}`)],
    [Markup.button.callback("✕ Close", "close")]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

// Simulate from goal
bot.action(/^sim:(\d+):(\d+):(\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  try { await ctx.answerCbQuery(); } catch {}

  const weekly = Number(ctx.match[1]);
  const years = Number(ctx.match[2]);
  const ret = Number(ctx.match[3]);

  await renderCard(ctx, userId, { weeklyAmount: weekly, years, annualReturnPct: ret, shockPct: null, shockYear: null });
});

// Compare preset buttons
bot.action(/^cmp:(\w+):(\w+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  try { await ctx.answerCbQuery(); } catch {}

  const etf1 = ctx.match[1];
  const etf2 = ctx.match[2];
  const preset1 = ETF_PRESETS[etf1];
  const preset2 = ETF_PRESETS[etf2];

  if (!preset1 || !preset2) return;

  const cur = userState.get(userId) || clampParams({});
  const years = cur.years || 10;
  const amount = cur.weeklyAmount || 100;

  const sim1 = simulateDCA({ ...cur, annualReturnPct: preset1.annualReturnPct, annualFeePct: preset1.annualFeePct, shockPct: preset1.typicalShock, shockYear: 3 });
  const sim2 = simulateDCA({ ...cur, annualReturnPct: preset2.annualReturnPct, annualFeePct: preset2.annualFeePct, shockPct: preset2.typicalShock, shockYear: 3 });

  const roi1 = sim1.contributed > 0 ? ((sim1.gains / sim1.contributed) * 100).toFixed(1) : "0";
  const roi2 = sim2.contributed > 0 ? ((sim2.gains / sim2.contributed) * 100).toFixed(1) : "0";

  const winner = sim1.finalValue > sim2.finalValue ? preset1.name : preset2.name;
  const diff = Math.abs(sim1.finalValue - sim2.finalValue);

  const msg =
    `⚖️ <b>${preset1.name} vs ${preset2.name}</b>\n` +
    `$${formatMoney(amount)}/week for ${years} years\n\n` +
    `<b>${preset1.name}</b>: $${formatMoney(sim1.finalValue)} (${roi1}% ROI)\n` +
    `<b>${preset2.name}</b>: $${formatMoney(sim2.finalValue)} (${roi2}% ROI)\n\n` +
    `🏆 ${winner} wins by $${formatMoney(diff)}`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback(`▶️ ${preset1.name}`, `etf:${etf1}`), Markup.button.callback(`▶️ ${preset2.name}`, `etf:${etf2}`)],
    [Markup.button.callback("✕ Close", "close")]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

// Portfolio Mix preset buttons
bot.action(/^mix:(\d+)(\w+)-(\d+)(\w+)(?:-(\d+)(\w+))?$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  try { await ctx.answerCbQuery(); } catch {}

  // Parse allocation: e.g., "60voo-40bnd" or "50voo-30qqq-20bnd"
  const allocations = [];
  allocations.push({ pct: Number(ctx.match[1]), name: ctx.match[2] });
  allocations.push({ pct: Number(ctx.match[3]), name: ctx.match[4] });
  if (ctx.match[5] && ctx.match[6]) {
    allocations.push({ pct: Number(ctx.match[5]), name: ctx.match[6] });
  }

  // Build mix command args and trigger /mix logic
  const args = allocations.flatMap(a => [a.pct.toString(), a.name]);

  // Calculate blended values
  let blendedReturn = 0, blendedFee = 0, blendedShock = 0;
  const validAllocs = [];

  for (const a of allocations) {
    const etf = ETF_PRESETS[a.name];
    if (etf) {
      validAllocs.push({ pct: a.pct, etf, name: a.name });
      const weight = a.pct / 100;
      blendedReturn += etf.annualReturnPct * weight;
      blendedFee += etf.annualFeePct * weight;
      blendedShock += etf.typicalShock * weight;
    }
  }

  if (validAllocs.length === 0) return;

  blendedReturn = Math.round(blendedReturn * 10) / 10;
  blendedFee = Math.round(blendedFee * 100) / 100;
  blendedShock = Math.round(blendedShock);

  const mixName = validAllocs.map(a => `${a.pct}% ${a.etf.name}`).join(" + ");

  const cur = userState.get(userId) || clampParams({});
  const sim = simulateDCA({
    ...cur,
    annualReturnPct: blendedReturn,
    annualFeePct: blendedFee,
    shockPct: blendedShock,
    shockYear: Math.min(cur.years || 10, 3)
  });

  const roi = sim.contributed > 0 ? ((sim.gains / sim.contributed) * 100).toFixed(1) : "0";

  const msg =
    `🎨 <b>Portfolio Mix</b>\n\n` +
    `<b>${mixName}</b>\n\n` +
    `📊 Blended return: ${blendedReturn}%\n` +
    `💰 Blended fee: ${blendedFee}%\n` +
    `📉 Blended crash: ${blendedShock}%\n\n` +
    `<b>Simulation (${cur.years || 10} years, $${formatMoney(cur.weeklyAmount || 100)}/wk):</b>\n` +
    `💵 Contributed: $${formatMoney(sim.contributed)}\n` +
    `📈 Final: $${formatMoney(sim.finalValue)}\n` +
    `✅ Gains: $${formatMoney(sim.gains)} (${roi}% ROI)\n` +
    `📉 Max drawdown: ${sim.maxDrawdownPct.toFixed(1)}%`;

  userState.set(userId, {
    ...cur,
    annualReturnPct: blendedReturn,
    annualFeePct: blendedFee,
    shockPct: blendedShock,
    shockYear: Math.min(cur.years || 10, 3),
    _mixName: mixName
  });

  const mixShort = validAllocs.map(a => `${a.pct}${a.name}`).join("-");

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("$-50/wk", `mix:amt:-50:${mixShort}`),
      Markup.button.callback("$+50/wk", `mix:amt:+50:${mixShort}`),
      Markup.button.callback("Yrs -1", `mix:yrs:-1:${mixShort}`),
      Markup.button.callback("Yrs +1", `mix:yrs:+1:${mixShort}`)
    ],
    [Markup.button.callback("▶️ Full simulation", `mix:run:${mixShort}`)],
    [
      Markup.button.callback("60/40 VOO/BND", "mix:60voo-40bnd"),
      Markup.button.callback("80/20 VOO/BND", "mix:80voo-20bnd")
    ],
    [
      Markup.button.callback("70/30 VTI/VXUS", "mix:70vti-30vxus"),
      Markup.button.callback("50/50 VOO/QQQ", "mix:50voo-50qqq")
    ],
    [Markup.button.callback("🏠 Menu", "home")]
  ]);

  await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});

// Mix amount/years adjustment handlers
bot.action(/^mix:amt:([+-]\d+):(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  try { await ctx.answerCbQuery(); } catch {}

  const delta = Number(ctx.match[1]);
  const mixShort = ctx.match[2];

  const cur = userState.get(userId) || clampParams({});
  const newAmount = Math.max(0, (cur.weeklyAmount || 100) + delta);
  userState.set(userId, { ...cur, weeklyAmount: newAmount });

  // Re-trigger the mix preset to refresh display
  // Parse mixShort back to allocations (e.g., "60voo-40bnd")
  const parts = mixShort.split("-");
  const allocations = [];
  for (const part of parts) {
    const match = part.match(/^(\d+)(\w+)$/);
    if (match) {
      const etf = ETF_PRESETS[match[2]];
      if (etf) allocations.push({ pct: Number(match[1]), etf, name: match[2] });
    }
  }

  if (allocations.length === 0) return;

  let blendedReturn = 0, blendedFee = 0, blendedShock = 0;
  allocations.forEach(a => {
    const weight = a.pct / 100;
    blendedReturn += a.etf.annualReturnPct * weight;
    blendedFee += a.etf.annualFeePct * weight;
    blendedShock += a.etf.typicalShock * weight;
  });

  blendedReturn = Math.round(blendedReturn * 10) / 10;
  blendedFee = Math.round(blendedFee * 100) / 100;
  blendedShock = Math.round(blendedShock);

  const mixName = allocations.map(a => `${a.pct}% ${a.etf.name}`).join(" + ");
  const updatedCur = userState.get(userId);

  const sim = simulateDCA({
    ...updatedCur,
    annualReturnPct: blendedReturn,
    annualFeePct: blendedFee,
    shockPct: blendedShock,
    shockYear: Math.min(updatedCur.years || 10, 3)
  });

  const roi = sim.contributed > 0 ? ((sim.gains / sim.contributed) * 100).toFixed(1) : "0";

  const msg =
    `🎨 <b>Portfolio Mix</b>\n\n` +
    `<b>${mixName}</b>\n\n` +
    `📊 Blended return: ${blendedReturn}%\n` +
    `💰 Blended fee: ${blendedFee}%\n` +
    `📉 Blended crash: ${blendedShock}%\n\n` +
    `<b>Simulation (${updatedCur.years || 10} years, $${formatMoney(updatedCur.weeklyAmount || 100)}/wk):</b>\n` +
    `💵 Contributed: $${formatMoney(sim.contributed)}\n` +
    `📈 Final: $${formatMoney(sim.finalValue)}\n` +
    `✅ Gains: $${formatMoney(sim.gains)} (${roi}% ROI)\n` +
    `📉 Max drawdown: ${sim.maxDrawdownPct.toFixed(1)}%`;

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("$-50/wk", `mix:amt:-50:${mixShort}`),
      Markup.button.callback("$+50/wk", `mix:amt:+50:${mixShort}`),
      Markup.button.callback("Yrs -1", `mix:yrs:-1:${mixShort}`),
      Markup.button.callback("Yrs +1", `mix:yrs:+1:${mixShort}`)
    ],
    [Markup.button.callback("▶️ Full simulation", `mix:run:${mixShort}`)],
    [
      Markup.button.callback("60/40 VOO/BND", "mix:60voo-40bnd"),
      Markup.button.callback("80/20 VOO/BND", "mix:80voo-20bnd")
    ],
    [
      Markup.button.callback("70/30 VTI/VXUS", "mix:70vti-30vxus"),
      Markup.button.callback("50/50 VOO/QQQ", "mix:50voo-50qqq")
    ],
    [Markup.button.callback("🏠 Menu", "home")]
  ]);

  try {
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
  } catch {
    await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
  }
});

bot.action(/^mix:yrs:([+-]\d+):(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  try { await ctx.answerCbQuery(); } catch {}

  const delta = Number(ctx.match[1]);
  const mixShort = ctx.match[2];

  const cur = userState.get(userId) || clampParams({});
  const newYears = Math.max(1, Math.min(50, (cur.years || 10) + delta));
  userState.set(userId, { ...cur, years: newYears });

  // Parse mixShort back to allocations
  const parts = mixShort.split("-");
  const allocations = [];
  for (const part of parts) {
    const match = part.match(/^(\d+)(\w+)$/);
    if (match) {
      const etf = ETF_PRESETS[match[2]];
      if (etf) allocations.push({ pct: Number(match[1]), etf, name: match[2] });
    }
  }

  if (allocations.length === 0) return;

  let blendedReturn = 0, blendedFee = 0, blendedShock = 0;
  allocations.forEach(a => {
    const weight = a.pct / 100;
    blendedReturn += a.etf.annualReturnPct * weight;
    blendedFee += a.etf.annualFeePct * weight;
    blendedShock += a.etf.typicalShock * weight;
  });

  blendedReturn = Math.round(blendedReturn * 10) / 10;
  blendedFee = Math.round(blendedFee * 100) / 100;
  blendedShock = Math.round(blendedShock);

  const mixName = allocations.map(a => `${a.pct}% ${a.etf.name}`).join(" + ");
  const updatedCur = userState.get(userId);

  const sim = simulateDCA({
    ...updatedCur,
    annualReturnPct: blendedReturn,
    annualFeePct: blendedFee,
    shockPct: blendedShock,
    shockYear: Math.min(updatedCur.years || 10, 3)
  });

  const roi = sim.contributed > 0 ? ((sim.gains / sim.contributed) * 100).toFixed(1) : "0";

  const msg =
    `🎨 <b>Portfolio Mix</b>\n\n` +
    `<b>${mixName}</b>\n\n` +
    `📊 Blended return: ${blendedReturn}%\n` +
    `💰 Blended fee: ${blendedFee}%\n` +
    `📉 Blended crash: ${blendedShock}%\n\n` +
    `<b>Simulation (${updatedCur.years || 10} years, $${formatMoney(updatedCur.weeklyAmount || 100)}/wk):</b>\n` +
    `💵 Contributed: $${formatMoney(sim.contributed)}\n` +
    `📈 Final: $${formatMoney(sim.finalValue)}\n` +
    `✅ Gains: $${formatMoney(sim.gains)} (${roi}% ROI)\n` +
    `📉 Max drawdown: ${sim.maxDrawdownPct.toFixed(1)}%`;

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("$-50/wk", `mix:amt:-50:${mixShort}`),
      Markup.button.callback("$+50/wk", `mix:amt:+50:${mixShort}`),
      Markup.button.callback("Yrs -1", `mix:yrs:-1:${mixShort}`),
      Markup.button.callback("Yrs +1", `mix:yrs:+1:${mixShort}`)
    ],
    [Markup.button.callback("▶️ Full simulation", `mix:run:${mixShort}`)],
    [
      Markup.button.callback("60/40 VOO/BND", "mix:60voo-40bnd"),
      Markup.button.callback("80/20 VOO/BND", "mix:80voo-20bnd")
    ],
    [
      Markup.button.callback("70/30 VTI/VXUS", "mix:70vti-30vxus"),
      Markup.button.callback("50/50 VOO/QQQ", "mix:50voo-50qqq")
    ],
    [Markup.button.callback("🏠 Menu", "home")]
  ]);

  try {
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
  } catch {
    await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
  }
});

// Mix full simulation (shows chart)
bot.action(/^mix:run:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cur = userState.get(userId);
  if (!cur) {
    try { await ctx.answerCbQuery("Run /mix first"); } catch {}
    return;
  }

  // Render full simulation card with the blended params
  await renderCard(ctx, userId, cur);
});

// Catch-all so you always get some response
bot.on("text", async (ctx) => {
  const t = ctx.message?.text || "";
  if (t.startsWith("/")) return;
  await ctx.reply("Type /help or /dca 100 10 8");
});

bot.catch((err) => console.error("BOT ERROR:", err));

// ─────────────────────────────────────────────────────────────────────────────
// Startup & Graceful Shutdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gracefully shutdown the bot and clean up resources
 * @param {string} signal - The signal that triggered shutdown
 */
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  // Stop the cleanup timer
  clearInterval(cleanupTimer);

  // Stop the bot
  bot.stop(signal);

  console.log("Bot stopped. Goodbye!");
  process.exit(0);
}

// Handle shutdown signals
process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

async function start() {
  // Avoid polling conflicts and webhook leftovers
  await bot.telegram.deleteWebhook().catch(() => {});
  await bot.launch();
  console.log("Bot running with long polling");
  console.log(`Cleanup interval: ${RATE_LIMIT.cleanupInterval / 1000}s | Session max age: ${RATE_LIMIT.maxAge / 1000}s`);
}

// Only start bot when running directly (not when imported for testing)
if (!isTestMode) {
  start();
}

// ─────────────────────────────────────────────────────────────────────────────
// Module Exports (for testing)
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  PRESETS,
  DEFAULTS,
  LIMITS,
  RATE_LIMIT,

  // Utility functions
  toNum,
  clamp,
  escHtml,

  // Financial calculations
  weeklyRateFromAnnual,
  weeklyFeeFactorFromAnnual,
  clampParams,

  // Simulation
  simulateDCA,

  // Parsing
  parseDcaCommand,
  formatMoney
};
