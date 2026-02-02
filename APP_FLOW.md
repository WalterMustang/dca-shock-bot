# Application Flow

## Entry Points

### /start
```
User sends /start
    ↓
Show welcome message with user's name
    ↓
Display ETF buttons (VOO, QQQ, VTI, BTC)
    ↓
User taps ETF → Run simulation with ETF preset
```

### /dca Command
```
User: /dca 100 10 8
    ↓
Parse: weeklyAmount=100, years=10, return=8%
    ↓
simulateDCA() → Calculate weekly compound growth
    ↓
quickChartUrl() → Generate chart URL
    ↓
buildCaption() → Format results with currency
    ↓
Send photo + caption + keyboard
```

## Core Flows

### Simulation Flow
```
Input Parameters
    ↓
clampParams() → Validate & constrain values
    ↓
simulateDCA() → Run week-by-week simulation
    │
    ├─ Track: portfolio, contributed, peak, drawdown
    ├─ Apply: weekly return, fees
    ├─ Handle: shock event at specified year
    ├─ Record: milestones at year boundaries
    └─ Calculate: inflation-adjusted value
    ↓
Return: { contributed, finalValue, gains, maxDrawdown, series, milestones }
```

### Button Interaction Flow
```
User taps button
    ↓
bot.action() handler matches pattern
    ↓
Retrieve user state from userState Map
    ↓
Modify parameter (e.g., years +1)
    ↓
Re-run simulation
    ↓
Update message with new results
```

### ETF Selection Flow
```
User taps ETF button (e.g., "VOO")
    ↓
bot.action(/^etf:(.+)$/) matches
    ↓
Look up ETF_PRESETS[etfKey]
    ↓
Merge ETF params with user's current state
    ↓
renderCard() → Show simulation with chart
```

### Portfolio Mix Flow
```
User: /mix 60 voo 40 bnd
    ↓
Parse allocations: [{pct:60, etf:voo}, {pct:40, etf:bnd}]
    ↓
Calculate blended values:
    - blendedReturn = Σ(etf.return * weight)
    - blendedFee = Σ(etf.fee * weight)
    - blendedShock = Σ(etf.shock * weight)
    ↓
Run simulation with blended params
    ↓
Show results + preset buttons
```

### Goal Calculator Flow
```
User: /goal 1000000 20 10
    ↓
Parse: target=$1M, years=20, return=10%
    ↓
Calculate using future value of annuity formula:
    PMT = FV * r / ((1 + r)^n - 1)
    ↓
Show weekly/monthly amount needed
    ↓
Button to simulate with calculated amount
```

### Close/Menu Flow
```
User taps "✕ Close" or "🏠 Menu"
    ↓
Delete current message (if close)
    ↓
Show home menu with:
    - ETF buttons
    - Portfolio Mix shortcut
    - Goals shortcut
    - Help/ETF info
```

## State Management

### userState Map
```javascript
userState.get(userId) → {
    weeklyAmount: 100,
    years: 10,
    annualReturnPct: 7,
    annualFeePct: 0,
    shockPct: -30,
    shockYear: 3,
    frequency: "weekly",
    currency: "usd",
    _mixName: "60% VOO + 40% BND"  // internal
}
```

### Rate Limiting
```
User action
    ↓
Check lastCall Map
    ↓
If (now - lastCall) < threshold → Ignore
    ↓
Else → Process & update lastCall
```

## Error Handling

### Chart Failures
```
replyWithPhoto() fails
    ↓
Fallback: Send text-only caption
    ↓
Send chart URL as separate message
```

### Message Edit Failures
```
editMessageMedia() fails (message too old/deleted)
    ↓
Fallback: Send new message instead
```
