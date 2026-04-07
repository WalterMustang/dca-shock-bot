function formatMoney(x, currencyCode, deps) {
  const { CURRENCIES } = deps;
  const n = Number(x);
  if (!Number.isFinite(n)) return "0";
  const formatted = n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const currency = CURRENCIES[currencyCode] || CURRENCIES.usd;
  return `${currency.symbol}${formatted}`;
}

function formatMixMessage(mixState, displayState, deps) {
  const { formatMoney } = deps;
  const curr = (displayState && displayState.currency) || "usd";
  const years = (displayState && displayState.years) || 10;
  const weeklyAmount = (displayState && displayState.weeklyAmount) || 100;

  return (
    `🎨 <b>Portfolio Mix</b>\n\n` +
    `<b>${mixState.mixName}</b>\n\n` +
    `📊 Blended return: ${mixState.blendedReturn}%\n` +
    `💰 Blended fee: ${mixState.blendedFee}%\n` +
    `📉 Blended crash: ${mixState.blendedShock}%\n\n` +
    `<b>Simulation (${years} years, ${formatMoney(weeklyAmount, curr)}/wk):</b>\n` +
    `💵 Contributed: ${formatMoney(mixState.sim.contributed, curr)}\n` +
    `📈 Final: ${formatMoney(mixState.sim.finalValue, curr)}\n` +
    `✅ Gains: ${formatMoney(mixState.sim.gains, curr)} (${mixState.roi}% ROI)\n` +
    `📉 Max drawdown: ${mixState.sim.maxDrawdownPct.toFixed(1)}%`
  );
}

function buildMixControlsKeyboard(mixShort, options, deps) {
  const { Markup } = deps;
  const opts = options || {};
  const amountButtonsWithDollar = opts.amountButtonsWithDollar !== false;
  const minusLabel = amountButtonsWithDollar ? "$-50/wk" : "-50/wk";
  const plusLabel = amountButtonsWithDollar ? "$+50/wk" : "+50/wk";

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(minusLabel, `mix:amt:-50:${mixShort}`),
      Markup.button.callback(plusLabel, `mix:amt:+50:${mixShort}`),
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
}

function keyboardFor(p, options, deps) {
  const { Markup } = deps;
  const opts = options || {};
  const shockOn = p.shockPct !== null && p.shockYear !== null;
  const { cta, hasSaved } = opts;

  const journeyRow = [];
  if (cta && cta.label && cta.action) {
    journeyRow.push(Markup.button.callback(cta.label, cta.action));
  }
  journeyRow.push(Markup.button.callback("💾 Save (session)", "save"));
  if (hasSaved) {
    journeyRow.push(Markup.button.callback("▶️ Run Saved (temp)", "runsaved"));
  }

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
    journeyRow.length > 0 ? journeyRow : [Markup.button.callback("💾 Save (session)", "save")],
    [
      Markup.button.callback("📚 ETFs", "showetf"),
      Markup.button.callback("❓ Help", "showhelp"),
      Markup.button.callback("✕ Close", "close")
    ]
  ]);
}

function buildCaption(sim, deps) {
  const { escHtml, formatMoney } = deps;
  const p = sim.params;
  const curr = p.currency || "usd";

  const header = `<b>📈 DCA Shock Bot</b>`;
  const freqLabel = p.frequency === "monthly" ? "Monthly" : "Weekly";
  const line1 = escHtml(`${freqLabel}: ${formatMoney(p.weeklyAmount, curr)} | Years: ${p.years} | Return: ${p.annualReturnPct}%`);

  const meta = [];
  if (p.annualFeePct > 0) meta.push(`Fee: ${p.annualFeePct}%`);
  if (p.shockPct !== null && p.shockYear !== null) meta.push(`Shock: ${p.shockPct}% @ year ${p.shockYear}`);
  if (meta.length === 0) meta.push("Shock: off");
  const line2 = escHtml(meta.join(" | "));

  const roi = sim.contributed > 0 ? ((sim.gains / sim.contributed) * 100).toFixed(1) : "0.0";

  const stats = [
    `💰 Contributed: ${formatMoney(sim.contributed, curr)}`,
    `📈 Final: ${formatMoney(sim.finalValue, curr)}`,
    `✅ Gains: ${formatMoney(sim.gains, curr)} (${roi}% ROI)`,
    `📉 Max drawdown: ${sim.maxDrawdownPct.toFixed(1)}%`
  ];

  if (sim.inflationAdjusted) {
    stats.push(`💵 After ${p.inflationPct || 3}% inflation: ${formatMoney(sim.inflationAdjusted, curr)}`);
  }

  if (p.shockPct !== null && p.shockYear !== null) {
    const rec = sim.recoveryWeeks === null ? "not reached" : `${sim.recoveryWeeks} weeks`;
    stats.push(`🔄 Recovery: ${rec}`);
  }

  if (sim.milestones && Object.keys(sim.milestones).length > 0) {
    const years = Object.keys(sim.milestones).map(Number).sort((a, b) => a - b);
    const keyYears = [];
    if (years.length <= 3) {
      keyYears.push.apply(keyYears, years);
    } else {
      keyYears.push(years[0]);
      keyYears.push(years[Math.floor(years.length / 2)]);
      keyYears.push(years[years.length - 1]);
    }
    const milestonesStr = keyYears
      .map((y) => `Yr${y}: ${formatMoney(sim.milestones[y], curr)}`)
      .join(" → ");
    stats.push(`📅 ${milestonesStr}`);
  }

  const assumptions = [
    "🧾 Assumptions: constant return, no taxes, fees as shown.",
    "⚠️ Education only — not financial advice."
  ];

  return [header, line1, line2, "", escHtml(stats.join("\n")), "", escHtml(assumptions.join("\n"))].join("\n");
}

function buildScenarioSummary(sim, curr, freqLabel, deps) {
  const { formatMoney } = deps;
  return `TL;DR: ${formatMoney(sim.params.weeklyAmount, curr)}/${freqLabel} for ${sim.params.years}y → ${formatMoney(sim.finalValue, curr)}.`;
}

module.exports = {
  formatMoney,
  formatMixMessage,
  buildMixControlsKeyboard,
  keyboardFor,
  buildCaption,
  buildScenarioSummary
};
