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

function clampParams(p, deps) {
  const { DEFAULTS, LIMITS, toNum, clamp } = deps;
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

function simulateDCA(params, deps) {
  const { clampParams: clampParamsFn, weeklyRateFromAnnual: weeklyRateFn, weeklyFeeFactorFromAnnual: weeklyFeeFn } = deps;
  const p = clampParamsFn(params);

  const isMonthly = p.frequency === "monthly";
  const periodsPerYear = isMonthly ? 12 : 52;
  const totalPeriods = Math.max(0, Math.floor(p.years * periodsPerYear));

  const rPeriod = isMonthly
    ? Math.pow(1 + p.annualReturnPct / 100, 1 / 12) - 1
    : weeklyRateFn(p.annualReturnPct);
  const feeFactor = isMonthly
    ? Math.pow(1 - p.annualFeePct / 100, 1 / 12)
    : weeklyFeeFn(p.annualFeePct);

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

    const year = Math.floor(period / periodsPerYear);
    if (period === year * periodsPerYear && year > 0) {
      milestones[year] = portfolio;
    }
  }

  if (p.years > 0) {
    milestones[p.years] = portfolio;
  }

  const inflationFactor = Math.pow(1 + (p.inflationPct || 3) / 100, p.years);
  const inflationAdjusted = portfolio / inflationFactor;

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

module.exports = {
  weeklyRateFromAnnual,
  weeklyFeeFactorFromAnnual,
  clampParams,
  simulateDCA
};
