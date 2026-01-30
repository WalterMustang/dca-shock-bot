// index.test.js - Unit tests for DCA Shock Bot

const assert = require("assert");
const {
  PRESETS,
  DEFAULTS,
  LIMITS,
  toNum,
  clamp,
  escHtml,
  weeklyRateFromAnnual,
  weeklyFeeFactorFromAnnual,
  clampParams,
  simulateDCA,
  parseDcaCommand,
  formatMoney
} = require("./index.js");

// Test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}

function assertClose(actual, expected, tolerance = 0.01) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${actual} to be close to ${expected} (tolerance: ${tolerance})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Function Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nUtility Functions:");

test("toNum converts valid numbers", () => {
  assert.strictEqual(toNum(42, 0), 42);
  assert.strictEqual(toNum("100", 0), 100);
  assert.strictEqual(toNum(3.14, 0), 3.14);
});

test("toNum returns fallback for invalid input", () => {
  assert.strictEqual(toNum("abc", 10), 10);
  assert.strictEqual(toNum(NaN, 5), 5);
  assert.strictEqual(toNum(Infinity, 7), 7);
  assert.strictEqual(toNum(undefined, 99), 99);
  // Note: Number(null) === 0, which is a finite number, so it returns 0
  assert.strictEqual(toNum(null, 1), 0);
});

test("clamp restricts values to range", () => {
  assert.strictEqual(clamp(5, 0, 10), 5);
  assert.strictEqual(clamp(-5, 0, 10), 0);
  assert.strictEqual(clamp(15, 0, 10), 10);
  assert.strictEqual(clamp(0, 0, 10), 0);
  assert.strictEqual(clamp(10, 0, 10), 10);
});

test("escHtml escapes special characters", () => {
  assert.strictEqual(escHtml("<script>"), "&lt;script&gt;");
  assert.strictEqual(escHtml("A & B"), "A &amp; B");
  assert.strictEqual(escHtml("normal text"), "normal text");
  assert.strictEqual(escHtml("<a href='test'>link</a>"), "&lt;a href='test'&gt;link&lt;/a&gt;");
});

test("formatMoney formats numbers correctly", () => {
  assert.strictEqual(formatMoney(1234), "1,234");
  assert.strictEqual(formatMoney(1000000), "1,000,000");
  assert.strictEqual(formatMoney(NaN), "0");
  assert.strictEqual(formatMoney(Infinity), "0");
});

// ─────────────────────────────────────────────────────────────────────────────
// Financial Calculation Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nFinancial Calculations:");

test("weeklyRateFromAnnual calculates correct compound rate", () => {
  // 7% annual should give ~0.13% weekly
  const weekly7 = weeklyRateFromAnnual(7);
  assertClose(weekly7, 0.00130, 0.0001);

  // Verify it compounds back to annual
  const compounded = Math.pow(1 + weekly7, 52) - 1;
  assertClose(compounded, 0.07, 0.001);
});

test("weeklyRateFromAnnual handles edge cases", () => {
  assert.strictEqual(weeklyRateFromAnnual(0), 0);
  assert.strictEqual(weeklyRateFromAnnual(-100), -1);
  assert(weeklyRateFromAnnual(-50) < 0);
});

test("weeklyFeeFactorFromAnnual calculates correct factor", () => {
  // 0% fee should give factor of 1
  assert.strictEqual(weeklyFeeFactorFromAnnual(0), 1);

  // 1% annual fee
  const factor1 = weeklyFeeFactorFromAnnual(1);
  assertClose(factor1, 0.9998, 0.0001);

  // Verify compounding: 52 weeks of fees should equal annual fee
  const yearlyEffect = Math.pow(factor1, 52);
  assertClose(yearlyEffect, 0.99, 0.001);
});

test("weeklyFeeFactorFromAnnual handles edge cases", () => {
  assert.strictEqual(weeklyFeeFactorFromAnnual(-1), 1);
  assert.strictEqual(weeklyFeeFactorFromAnnual(100), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Parameter Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nParameter Validation:");

test("clampParams applies defaults for missing values", () => {
  const result = clampParams({});
  assert.strictEqual(result.weeklyAmount, DEFAULTS.weeklyAmount);
  assert.strictEqual(result.years, DEFAULTS.years);
  assert.strictEqual(result.annualReturnPct, DEFAULTS.annualReturnPct);
  assert.strictEqual(result.annualFeePct, DEFAULTS.annualFeePct);
});

test("clampParams enforces limits", () => {
  const result = clampParams({
    weeklyAmount: -100,
    years: 100,
    annualReturnPct: 500,
    annualFeePct: 10
  });

  assert.strictEqual(result.weeklyAmount, LIMITS.weeklyAmount.min);
  assert.strictEqual(result.years, LIMITS.years.max);
  assert.strictEqual(result.annualReturnPct, LIMITS.annualReturnPct.max);
  assert.strictEqual(result.annualFeePct, LIMITS.annualFeePct.max);
});

test("clampParams handles shock parameters", () => {
  const withShock = clampParams({ shockPct: -30, shockYear: 5, years: 10 });
  assert.strictEqual(withShock.shockPct, -30);
  assert.strictEqual(withShock.shockYear, 5);

  const noShock = clampParams({ shockPct: null, shockYear: null });
  assert.strictEqual(noShock.shockPct, null);
  assert.strictEqual(noShock.shockYear, null);
});

test("clampParams clamps shockYear to years", () => {
  const result = clampParams({ shockPct: -30, shockYear: 15, years: 10 });
  assert.strictEqual(result.shockYear, 10);
});

test("clampParams enforces shock percentage limits", () => {
  const tooLow = clampParams({ shockPct: -99, shockYear: 3 });
  assert.strictEqual(tooLow.shockPct, LIMITS.shockPct.min);

  const positive = clampParams({ shockPct: 10, shockYear: 3 });
  assert.strictEqual(positive.shockPct, LIMITS.shockPct.max);
});

// ─────────────────────────────────────────────────────────────────────────────
// DCA Simulation Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nDCA Simulation:");

test("simulateDCA calculates basic DCA correctly", () => {
  const result = simulateDCA({
    weeklyAmount: 100,
    years: 1,
    annualReturnPct: 0,
    annualFeePct: 0,
    shockPct: null,
    shockYear: null
  });

  assert.strictEqual(result.contributed, 100 * 52);
  assert.strictEqual(result.finalValue, 100 * 52);
  assert.strictEqual(result.gains, 0);
  assert.strictEqual(result.series.length, 52);
});

test("simulateDCA applies compound growth", () => {
  const result = simulateDCA({
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 7,
    annualFeePct: 0,
    shockPct: null,
    shockYear: null
  });

  // With 7% growth, final should be more than contributed
  assert(result.finalValue > result.contributed);
  assert(result.gains > 0);

  // Rough check: 10 years of $100/week with 7% should be ~$70k-80k
  assert(result.finalValue > 60000);
  assert(result.finalValue < 90000);
});

test("simulateDCA applies fees correctly", () => {
  const noFee = simulateDCA({
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 7,
    annualFeePct: 0,
    shockPct: null,
    shockYear: null
  });

  const withFee = simulateDCA({
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 7,
    annualFeePct: 1,
    shockPct: null,
    shockYear: null
  });

  // Fee should reduce final value
  assert(withFee.finalValue < noFee.finalValue);
});

test("simulateDCA handles shock events", () => {
  const noShock = simulateDCA({
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 7,
    annualFeePct: 0,
    shockPct: null,
    shockYear: null
  });

  const withShock = simulateDCA({
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 7,
    annualFeePct: 0,
    shockPct: -30,
    shockYear: 3
  });

  // Shock should reduce final value
  assert(withShock.finalValue < noShock.finalValue);

  // Max drawdown should be at least 30%
  assert(withShock.maxDrawdownPct <= -25);
});

test("simulateDCA calculates recovery time", () => {
  const result = simulateDCA({
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 10,
    annualFeePct: 0,
    shockPct: -20,
    shockYear: 2
  });

  // With good returns, should eventually recover
  assert(result.recoveryWeeks !== null);
  assert(result.recoveryWeeks > 0);
});

test("simulateDCA handles 0 years", () => {
  const result = simulateDCA({
    weeklyAmount: 100,
    years: 0,
    annualReturnPct: 7,
    annualFeePct: 0,
    shockPct: null,
    shockYear: null
  });

  assert.strictEqual(result.contributed, 0);
  assert.strictEqual(result.finalValue, 0);
  assert.strictEqual(result.series.length, 0);
});

test("simulateDCA handles negative returns", () => {
  const result = simulateDCA({
    weeklyAmount: 100,
    years: 5,
    annualReturnPct: -10,
    annualFeePct: 0,
    shockPct: null,
    shockYear: null
  });

  // With negative returns, final should be less than contributed
  assert(result.finalValue < result.contributed);
  assert(result.gains < 0);
  // Note: maxDrawdownPct can be 0 with DCA and negative returns
  // because weekly contributions may keep pushing to new peaks
  // even as the portfolio loses value. The drawdown calculation
  // is from peak, which keeps updating with new contributions.
  assert(result.maxDrawdownPct <= 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Command Parsing Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nCommand Parsing:");

test("parseDcaCommand parses basic command", () => {
  const result = parseDcaCommand("/dca 150 20 10");
  assert.strictEqual(result.weeklyAmount, 150);
  assert.strictEqual(result.years, 20);
  assert.strictEqual(result.annualReturnPct, 10);
});

test("parseDcaCommand parses fee parameter", () => {
  const result = parseDcaCommand("/dca 100 10 7 fee 0.5");
  assert.strictEqual(result.annualFeePct, 0.5);
});

test("parseDcaCommand parses shock parameters", () => {
  const result = parseDcaCommand("/dca 100 10 7 shock -25 at 4");
  assert.strictEqual(result.shockPct, -25);
  assert.strictEqual(result.shockYear, 4);
});

test("parseDcaCommand parses complex command", () => {
  const result = parseDcaCommand("/dca 200 15 8 fee 0.2 shock -40 at 5");
  assert.strictEqual(result.weeklyAmount, 200);
  assert.strictEqual(result.years, 15);
  assert.strictEqual(result.annualReturnPct, 8);
  assert.strictEqual(result.annualFeePct, 0.2);
  assert.strictEqual(result.shockPct, -40);
  assert.strictEqual(result.shockYear, 5);
});

test("parseDcaCommand uses defaults for missing params", () => {
  const result = parseDcaCommand("/dca");
  assert.strictEqual(result.weeklyAmount, DEFAULTS.weeklyAmount);
  assert.strictEqual(result.years, DEFAULTS.years);
  assert.strictEqual(result.annualReturnPct, DEFAULTS.annualReturnPct);
});

test("parseDcaCommand handles invalid input gracefully", () => {
  const result = parseDcaCommand("/dca abc xyz");
  assert.strictEqual(result.weeklyAmount, DEFAULTS.weeklyAmount);
  assert.strictEqual(result.years, DEFAULTS.years);
});

// ─────────────────────────────────────────────────────────────────────────────
// Preset Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nPresets:");

test("PRESETS.base is correctly defined", () => {
  assert.strictEqual(PRESETS.base.weeklyAmount, 100);
  assert.strictEqual(PRESETS.base.years, 10);
  assert.strictEqual(PRESETS.base.annualReturnPct, 7);
  assert.strictEqual(PRESETS.base.shockPct, -30);
  assert.strictEqual(PRESETS.base.shockYear, 3);
});

test("PRESETS.bull has no shock", () => {
  assert.strictEqual(PRESETS.bull.annualReturnPct, 12);
  assert.strictEqual(PRESETS.bull.shockPct, null);
  assert.strictEqual(PRESETS.bull.shockYear, null);
});

test("PRESETS.pain has larger shock", () => {
  assert.strictEqual(PRESETS.pain.shockPct, -50);
  assert.strictEqual(PRESETS.pain.shockYear, 2);
});

test("All presets produce valid simulations", () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    const result = simulateDCA(preset);
    assert(result.finalValue > 0, `${name} should produce positive final value`);
    assert(result.series.length > 0, `${name} should produce series data`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(60));
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log("─".repeat(60));

process.exit(failed > 0 ? 1 : 0);
