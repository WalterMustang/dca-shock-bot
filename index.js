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

const DEFAULTS = {
  weeklyAmount: 100,
  years: 10,
  annualReturnPct: 7,
  annualFeePct: 0,
  shockPct: null,
  shockYear: null
};

const LIMITS = {
  weeklyAmount: { min: 0, max: 1_000_000 },
  years: { min: 0, max: 50 },
  annualReturnPct: { min: -100, max: 200 },
  annualFeePct: { min: 0, max: 5 },
  shockPct: { min: -95, max: 0 }
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
 */

/**
 * Run a DCA (Dollar Cost Averaging) simulation with optional shock event
 * @param {object} params - Simulation parameters
 * @param {number} params.weeklyAmount - Weekly contribution amount
 * @param {number} params.years - Investment duration in years
 * @param {number} params.annualReturnPct - Expected annual return percentage
 * @param {number} params.annualFeePct - Annual management fee percentage
 * @param {number|null} params.shockPct - Shock event percentage (negative)
 * @param {number|null} params.shockYear - Year when shock occurs
 * @returns {SimulationResult} Simulation results
 */
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
  const maxPoints = 180;
  const step = Math.max(1, Math.floor(series.length / maxPoints));
  const sampled = [];
  for (let i = 0; i < series.length; i += step) sampled.push(Math.round(series[i]));

  const cfg = {
    type: "line",
    data: {
      datasets: [
        {
          label: "Portfolio",
          data: sampled,
          pointRadius: 0,
          borderWidth: 3,
          borderColor: "#007AFF",
          backgroundColor: "rgba(0, 122, 255, 0.1)",
          fill: true,
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
        x: { display: false, grid: { display: false } },
        y: { grid: { color: "rgba(0,0,0,0.06)" } }
      }
    }
  };

  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return `https://quickchart.io/chart?c=${encoded}&w=980&h=560&backgroundColor=white`;
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
      Markup.button.callback("Years -1", "years:-1"),
      Markup.button.callback("Years +1", "years:+1")
    ],
    [
      Markup.button.callback("Return -2%", "ret:-2"),
      Markup.button.callback("Return +2%", "ret:+2"),
      Markup.button.callback(shockOn ? `${p.shockPct}%` : "Shock", "shock:toggle"),
      Markup.button.callback(shockOn ? "Worse" : "--", shockOn ? "shockpct:-10" : "noop")
    ],
    [
      Markup.button.callback("Yr -1", shockOn ? "shockyear:-1" : "noop"),
      Markup.button.callback("Yr +1", shockOn ? "shockyear:+1" : "noop"),
      Markup.button.callback("Base", "preset:base"),
      Markup.button.callback("Bull", "preset:bull")
    ],
    [
      Markup.button.callback("Pain", "preset:pain"),
      Markup.button.callback("Share", "share")
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

  const header = `<b>${escHtml("DCA Shock Bot")}</b>`;
  const line1 = escHtml(`Weekly: $${formatMoney(p.weeklyAmount)} | Years: ${p.years} | Return: ${p.annualReturnPct}%`);

  const meta = [];
  if (p.annualFeePct > 0) meta.push(`Fee: ${p.annualFeePct}%`);
  if (p.shockPct !== null && p.shockYear !== null) meta.push(`Shock: ${p.shockPct}% @ year ${p.shockYear}`);
  if (meta.length === 0) meta.push("Shock: off");
  const line2 = escHtml(meta.join(" | "));

  // Calculate ROI percentage
  const roi = sim.contributed > 0 ? ((sim.gains / sim.contributed) * 100).toFixed(1) : "0.0";

  const stats = [
    `Contributed: $${formatMoney(sim.contributed)}`,
    `Final: $${formatMoney(sim.finalValue)}`,
    `Gains: $${formatMoney(sim.gains)} (${roi}% ROI)`,
    `Max drawdown: ${sim.maxDrawdownPct.toFixed(1)}%`
  ];

  if (p.shockPct !== null && p.shockYear !== null) {
    const rec = sim.recoveryWeeks === null ? "not reached" : `${sim.recoveryWeeks} weeks`;
    stats.push(`Recovery: ${rec}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// Button Actions
// ─────────────────────────────────────────────────────────────────────────────

bot.action("noop", async (ctx) => {
  try {
    await ctx.answerCbQuery("Turn shock on first");
  } catch {}
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

  const feePart = cur.annualFeePct > 0 ? ` fee ${cur.annualFeePct}` : "";
  const shockPart = cur.shockPct !== null && cur.shockYear !== null ? ` shock ${cur.shockPct} at ${cur.shockYear}` : "";
  const cmd = `/dca ${cur.weeklyAmount} ${cur.years} ${cur.annualReturnPct}${feePart}${shockPart}`;

  await ctx.reply(
    `Share:\nI ran $${formatMoney(cur.weeklyAmount)}/week for ${cur.years}y at ${cur.annualReturnPct}%` +
      (shockPart ? ` with a ${cur.shockPct}% shock in year ${cur.shockYear}` : "") +
      `.\n\nCommand:\n${cmd}`
  );

  try {
    await ctx.answerCbQuery();
  } catch {}
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
