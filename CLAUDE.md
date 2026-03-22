# Claude Agent Rules

## Before Starting Any Work

1. **Read progress.txt** - Know what was done in previous sessions
2. **Read lessons.md** - Avoid repeating past mistakes
3. **Run tests** - `npm test` to verify everything works
4. **Check git status** - See if there are uncommitted changes

---

## Project Overview

**DCA Shock Bot** is a Telegram bot that simulates Dollar Cost Averaging (DCA) investment strategies, including market crash ("shock") scenarios, ETF comparisons, and portfolio mixing.

- **Runtime**: Node.js 20.x (see `.nvmrc`)
- **Framework**: Telegraf 4.x (Telegram bot framework)
- **Dependencies**: `telegraf` only — no database, no external data feeds
- **State**: In-memory only (`Map<userId, object>`) — all state is ephemeral per session
- **Charts**: QuickChart.io (external service, Chart.js **v2** syntax)
- **Deployment**: Docker (via `Dockerfile`) or Railway

---

## File Structure

```
dca-shock-bot/
├── index.js                  # Entire bot: constants, engine, commands, actions
├── index.test.js             # Unit tests for exported pure functions
├── package.json              # telegraf dependency, node 20.x engine
├── Dockerfile                # node:20-alpine, npm install --omit=dev
├── .nvmrc                    # Node version: 20
├── README.md                 # User-facing documentation
├── LICENSE                   # MIT
├── PRD.md                    # Product requirements document
├── APP_FLOW.md               # Application flow diagrams
├── IMPLEMENTATION_PLAN.md    # Feature roadmap
├── FEATURE_PLAN_20260204.md  # Detailed phased feature plan (3 phases)
├── progress.txt              # Session progress log (UPDATE after each session)
├── CLAUDE.md                 # This file - agent rules
└── lessons.md                # Past failures and hard-won learnings
```

Only `index.js` and `index.test.js` contain code. **Do not create new source files.**

---

## index.js Architecture

The file is organized in sections (marked with `// ─────...─────` separators):

### 1. Constants & Presets
- `PRESETS` — 3 scenario presets: `base`, `bull`, `pain`
- `ETF_PRESETS` — 6 ETF objects: `voo`, `qqq`, `vti`, `vxus`, `bnd`, `btc`
- `DEFAULTS` — default simulation parameters (weeklyAmount, years, return, fee, frequency, inflation, currency)
- `LIMITS` — min/max bounds for all parameters
- `RATE_LIMIT` — command (900ms) and button (350ms) cooldowns
- `CURRENCIES` — `usd`, `eur`, `chf` with symbols

### 2. State Management
- `userState: Map<userId, object>` — per-user simulation params + metadata
- `lastCall: Map<userId, number>` — timestamps for rate limiting
- `isRateLimited(userId, ms)` — returns `true` if too fast; also updates timestamp
- `cleanupStaleSessions()` — runs on interval, removes entries older than 5 min

### 3. Utility Functions (exported for testing)
- `escHtml(s)` — escapes `&`, `<`, `>` for Telegram HTML mode
- `toNum(x, fallback)` — safe number conversion; returns fallback for NaN/Infinity
- `clamp(value, min, max)` — bounds a value

### 4. Financial Calculations (exported for testing)
- `weeklyRateFromAnnual(annualPct)` — compound weekly rate from annual %
- `weeklyFeeFactorFromAnnual(feePct)` — weekly fee multiplier from annual %
- `clampParams(p)` — validates/clamps all simulation parameters, applies DEFAULTS

### 5. DCA Simulation Engine (exported for testing)
- `simulateDCA(params)` — core engine; returns `SimulationResult`:
  - `params`, `contributed`, `finalValue`, `gains`
  - `maxDrawdownPct`, `recoveryWeeks` (weeks to recover from shock)
  - `series[]` — weekly/monthly portfolio values for charting
  - `milestones{}` — portfolio value at year boundaries
  - `inflationAdjusted` — final value deflated by inflation

### 6. Formatting (exported for testing)
- `formatMoney(x, currencyCode)` — formats as `$1,234`, `€1,234`, `CHF 1,234`

### 7. Command Parsing (exported for testing)
- `parseDcaCommand(text)` — parses `/dca 100 10 7 fee 0.5 shock -30 at 3`
- `parseCompareCommand(text)` — parses `/compare voo qqq` or `/compare 100 10 8 vs 100 10 12`

### 8. Chart Generation
- `quickChartUrl(series)` — single-line portfolio chart (Chart.js v2, QuickChart.io)
- `quickCompareChartUrl(left, right, leftLabel, rightLabel)` — two-line comparison chart

### 9. UI Components
- `keyboardFor(p, options)` — main inline keyboard with adjustment buttons
  - `options.cta` — journey CTA button `{label, action}`
  - `options.hasSaved` — shows "Run Saved" button if a scenario is saved
- `buildCaption(sim)` — HTML result caption (header, stats, milestones, disclaimer)
- `buildScenarioSummary(sim, curr, freqLabel)` — one-line TL;DR for sharing
- `getJourneyCta(state)` — context-aware "Next best action" CTA button
- `renderCard(ctx, userId, params, context)` — renders chart + caption + keyboard; handles both command and callback_query contexts with fallbacks

### 10. Bot Commands
| Command | Description |
|---|---|
| `/start` | Onboarding with ETF quick-start buttons |
| `/ping` | Health check → "pong" |
| `/help` | Command reference |
| `/dca` | Run simulation with custom params |
| `/base`, `/bull`, `/pain` | Apply named PRESETS |
| `/goal` | Reverse DCA: target amount → weekly contribution needed |
| `/compare` | Side-by-side ETF or scenario comparison |
| `/monthly` | Switch to monthly contribution frequency |
| `/currency` | Set display currency (USD/EUR/CHF) |
| `/mix` | Blend multiple ETFs with custom allocations |
| `/etf` | List all ETF presets with details |
| `/voo`, `/qqq`, `/vti`, `/vxus`, `/bnd`, `/btc` | Quick ETF simulations |

### 11. Bot Actions (inline button callbacks)
| Pattern | Action |
|---|---|
| `showetf`, `showhelp` | Display info panels |
| `noop` | No-op (disabled buttons) |
| `cur:<code>` | Set currency |
| `close` | Delete message + show home menu |
| `home` | Show home menu |
| `run:default` | Run default simulation |
| `preset:<name>` | Apply preset |
| `etf:<key>` | Run ETF simulation |
| `years:<±n>`, `ret:<±n>`, `amt:<±n>` | Adjust parameters |
| `shock:toggle` | Toggle shock on/off |
| `shockpct:<±n>`, `shockyear:<±n>` | Adjust shock |
| `share` | Show Twitter share text with TL;DR summary |
| `save` | Save current scenario to session memory |
| `runsaved` | Re-run saved scenario |
| `journey:compare:<e1>:<e2>` | Journey CTA → compare ETFs |
| `journey:goal:<amount>` | Journey CTA → goal calculator |
| `goal:<amount>` | Goal preset button |
| `sim:<amt>:<yrs>:<ret>` | Run quick simulation from params |
| `cmp:<etf1>:<etf2>` | Compare two ETFs |
| `mix:<pct><etf>-<pct><etf>[-<pct><etf>]` | Run portfolio mix |
| `mix:amt:<±n>:<spec>`, `mix:yrs:<±n>:<spec>` | Adjust mix parameters |
| `mix:run:<spec>` | Run mix with encoded spec |

### 12. Lifecycle
- Deletes Telegram webhook on start (avoids polling conflicts)
- Graceful shutdown on `SIGINT`/`SIGTERM`: stops polling, clears interval timer
- `isTestMode` guard: bot starts only when `NODE_ENV !== "test"`

---

## Code Rules

### No New Dependencies
- Do NOT add packages to `package.json` without explicit user approval
- Current runtime dep: `telegraf` only
- Use built-in Node.js modules when possible

### Command Format
```javascript
bot.command("commandname", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (isRateLimited(userId)) return;

    // ... logic ...

    const kb = Markup.inlineKeyboard([
        // Always include close/menu button
        [Markup.button.callback("✕ Close", "close")]
    ]);

    await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb.reply_markup });
});
```

### Button Action Format
```javascript
bot.action(/^pattern:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    try { await ctx.answerCbQuery(); } catch {}

    // ... logic ...
});
```

### Currency Handling
- Always get currency from user state: `const curr = (userState.get(userId) || {}).currency || "usd";`
- Always pass to `formatMoney`: `formatMoney(amount, curr)`
- Never hardcode `"$"` in output strings — `formatMoney` includes the symbol

### State Management
```javascript
const cur = userState.get(userId) || clampParams({});
// Modify
userState.set(userId, { ...cur, newValue: x });
```

### Chart Rules
- QuickChart uses **Chart.js v2** — use `scales: { xAxes: [...], yAxes: [...] }` (NOT v3's `scales: { x:..., y:... }`)
- Do NOT use JavaScript callback functions inside chart config — JSON can't serialize them
- Always include `labels` array (even empty strings) or the chart won't render
- Always include `label` property on each dataset

---

## Output Format

### Messages
- Use HTML parse mode: `parse_mode: "HTML"`
- Bold: `<b>text</b>`, Italic: `<i>text</i>`, Code: `<code>text</code>`
- Escape all user-supplied or dynamic strings: `escHtml(value)`

### Numbers
- Money: `formatMoney(value, currency)` — always pass currency
- Percentages: `.toFixed(1)`
- Large counts: `.toLocaleString()`

---

## Testing

### Run Tests
```bash
npm test
# Runs: NODE_ENV=test node index.test.js
```

### Exported Functions (testable)
`PRESETS`, `DEFAULTS`, `LIMITS`, `toNum`, `clamp`, `escHtml`, `weeklyRateFromAnnual`, `weeklyFeeFactorFromAnnual`, `clampParams`, `simulateDCA`, `parseDcaCommand`, `parseCompareCommand`, `formatMoney`

### Test Coverage (31 tests in index.test.js)
- Utility functions: `toNum`, `clamp`, `escHtml`, `formatMoney`
- Financial math: `weeklyRateFromAnnual`, `weeklyFeeFactorFromAnnual`
- Parameter validation: `clampParams` (defaults, limits, shock, edge cases)
- Simulation engine: `simulateDCA` (basic DCA, compound growth, fees, shock, recovery, 0 years, negative returns)
- Command parsing: `parseDcaCommand`, `parseCompareCommand`
- Presets: all PRESETS produce valid simulations

### What to Test
- Pure functions (calculations, parsing)
- Edge cases (0, negative, null, undefined)
- Do NOT test Telegram interactions (commands, actions, `ctx.*`)

---

## Git Rules

### Commit Messages
```
Add <feature name>

<Brief description of what was added>

https://claude.ai/code/session_<id>
```

### Branch
- Always work on the designated `claude/...` feature branch
- Never push to `main` without a PR

### Before Committing
1. Run tests: `npm test`
2. Check for linting issues
3. Update `progress.txt`

---

## Common Patterns

### Adding an ETF Preset
```javascript
// 1. Add to ETF_PRESETS constant
newetf: {
    name: "NEWETF",
    fullName: "Full Name Here",
    annualReturnPct: 10,
    annualFeePct: 0.1,
    description: "Description for users",
    typicalShock: -30
}

// 2. Add shortcut command (ETF_PRESETS already drives /etf list automatically)
bot.command("newetf", async (ctx) => { ... });
```

### Adding a Keyboard Button
```javascript
Markup.button.callback("Label", "action:param")
```

### renderCard — the Main Render Helper
Most ETF/preset actions call `renderCard(ctx, userId, params, { source, etfKey })`.
It: runs `simulateDCA`, generates chart URL, builds caption, assembles keyboard with CTA, and sends/edits the message.

### Session-Saved Scenario
Users can save a scenario with the "💾 Save (session)" button. Stored in `userState` as `savedScenario`. The "▶️ Run Saved" button appears when `hasSaved` is true.

---

## What NOT to Do

1. Don't add `console.log` for debugging — remove before committing
2. Don't use JavaScript callback functions in chart config — JSON can't serialize them
3. Don't hardcode `"$"` when `formatMoney` handles it
4. Don't create new source files without asking
5. Don't modify `package.json` dependencies without approval
6. Don't use Chart.js v3 syntax — QuickChart.io uses v2
7. Don't call `ctx.deleteMessage()` without sending a replacement (use "close" action pattern)
8. Don't forget `try { await ctx.answerCbQuery(); } catch {}` in every action handler
9. Don't forget to save updated state: `userState.set(userId, { ...cur, updated })` after modifications
