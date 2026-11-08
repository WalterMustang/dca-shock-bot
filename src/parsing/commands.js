function parseDcaCommand(text, deps) {
  const { DEFAULTS, toNum, clampParams } = deps;
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
    const p = parts[i] && parts[i].toLowerCase();

    if (p === "fee" && i + 1 < parts.length) {
      annualFeePct = toNum(parts[i + 1], 0);
      i += 1;
      continue;
    }

    if (p === "shock" && i + 3 < parts.length) {
      const sPct = toNum(parts[i + 1], null);
      const at = parts[i + 2] && parts[i + 2].toLowerCase();
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

function parseCompareCommand(text, deps) {
  const { DEFAULTS, toNum, clampParams } = deps;
  const raw = String(text || "").trim();
  const parts = raw.split(/\s+/);

  if (parts.length >= 3 && !parts.includes("vs")) {
    return {
      kind: "etf",
      etf1: String(parts[1] || "voo").toLowerCase(),
      etf2: String(parts[2] || "qqq").toLowerCase()
    };
  }

  const vsIndex = parts.findIndex((p) => p.toLowerCase() === "vs");
  if (vsIndex <= 1 || vsIndex >= parts.length - 1) {
    return { kind: "invalid" };
  }

  const leftArgs = parts.slice(1, vsIndex);
  const rightArgs = parts.slice(vsIndex + 1);

  if (leftArgs.length < 3 || rightArgs.length < 3) {
    return { kind: "invalid" };
  }

  const left = clampParams({
    weeklyAmount: toNum(leftArgs[0], DEFAULTS.weeklyAmount),
    years: toNum(leftArgs[1], DEFAULTS.years),
    annualReturnPct: toNum(leftArgs[2], DEFAULTS.annualReturnPct)
  });
  const right = clampParams({
    weeklyAmount: toNum(rightArgs[0], DEFAULTS.weeklyAmount),
    years: toNum(rightArgs[1], DEFAULTS.years),
    annualReturnPct: toNum(rightArgs[2], DEFAULTS.annualReturnPct)
  });

  return { kind: "scenario", left, right };
}

function hasOwnKey(obj, key) {
  return obj != null && typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Validate and normalize mix allocations:
 * - drops entries with unknown ETFs (own keys only, no prototype lookups) or non-positive/non-finite pct
 * - merges duplicate ETFs
 * - rescales to exactly 100% using largest-remainder rounding
 * The number of distinct ETFs is bounded by ETF_PRESETS, which keeps callback_data short.
 */
function normalizeMixAllocations(allocations, deps) {
  const { ETF_PRESETS } = deps;
  if (!Array.isArray(allocations)) return [];

  const merged = new Map();
  for (const a of allocations) {
    const name = a && String(a.name || "").toLowerCase();
    const pct = Number(a && a.pct);
    if (!hasOwnKey(ETF_PRESETS, name)) continue;
    if (!Number.isFinite(pct) || pct <= 0) continue;
    merged.set(name, (merged.get(name) || 0) + pct);
  }

  const total = [...merged.values()].reduce((sum, pct) => sum + pct, 0);
  if (merged.size === 0 || !Number.isFinite(total) || total <= 0) return [];

  const scaled = [...merged.entries()].map(([name, pct]) => {
    const exact = (pct / total) * 100;
    return { name, floor: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let remaining = 100 - scaled.reduce((sum, s) => sum + s.floor, 0);
  const byRemainder = [...scaled].sort((a, b) => b.rem - a.rem);
  for (let i = 0; remaining > 0 && i < byRemainder.length; i++, remaining--) {
    byRemainder[i].floor += 1;
  }

  return scaled
    .filter((s) => s.floor > 0)
    .map((s) => ({ pct: s.floor, etf: ETF_PRESETS[s.name], name: s.name }));
}

function parseMixShortAllocations(mixShort, deps) {
  const parts = String(mixShort || "").split("-");
  const allocations = [];

  for (const part of parts) {
    const match = part.match(/^(\d+)(\w+)$/);
    if (!match) continue;
    allocations.push({ pct: Number(match[1]), name: match[2] });
  }

  return normalizeMixAllocations(allocations, deps);
}

function buildMixSimulationState(allocations, baseState, deps) {
  const { simulateDCA } = deps;
  if (!Array.isArray(allocations) || allocations.length === 0) return null;

  let blendedReturn = 0;
  let blendedFee = 0;
  let blendedShock = 0;

  allocations.forEach((a) => {
    const weight = a.pct / 100;
    blendedReturn += a.etf.annualReturnPct * weight;
    blendedFee += a.etf.annualFeePct * weight;
    blendedShock += a.etf.typicalShock * weight;
  });

  blendedReturn = Math.round(blendedReturn * 10) / 10;
  blendedFee = Math.round(blendedFee * 100) / 100;
  blendedShock = Math.round(blendedShock);

  const mixName = allocations.map((a) => `${a.pct}% ${a.etf.name}`).join(" + ");
  const mixShort = allocations.map((a) => `${a.pct}${a.name}`).join("-");

  const sim = simulateDCA({
    ...(baseState || {}),
    annualReturnPct: blendedReturn,
    annualFeePct: blendedFee,
    shockPct: blendedShock,
    shockYear: Math.min((baseState && baseState.years) || 10, 3)
  });

  const roi = sim.contributed > 0 ? ((sim.gains / sim.contributed) * 100).toFixed(1) : "0";

  return {
    blendedReturn,
    blendedFee,
    blendedShock,
    mixName,
    mixShort,
    sim,
    roi
  };
}

module.exports = {
  hasOwnKey,
  normalizeMixAllocations,
  parseDcaCommand,
  parseCompareCommand,
  parseMixShortAllocations,
  buildMixSimulationState
};
