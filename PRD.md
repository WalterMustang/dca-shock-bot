# Product Requirements Document (PRD)

## DCA Shock Bot

_Last verified against code on 2026-03-27._

### Overview
A Telegram bot that helps users visualize Dollar Cost Averaging (DCA) investment strategies, including market crash scenarios, ETF comparisons, and portfolio mixing.

### Target Users
- Beginner investors learning about DCA
- People planning long-term investment strategies
- Users wanting to understand market crash impact on portfolios

### Current Shipped Behavior

#### 1. DCA Simulation
- **Command**: `/dca <weekly_amount> <years> <return%> [shock <pct> at <year>]`
- Calculates weekly compound growth
- Shows final portfolio value, gains, ROI
- Visualizes growth with chart
- Supports market crash ("shock") scenarios
- Supports optional fee parsing (`fee <pct>`) and tracks inflation-adjusted final value

#### 2. ETF Presets
- **VOO**: S&P 500 (10.5% avg return)
- **QQQ**: Nasdaq 100 Tech (14% avg return)
- **VTI**: Total US Market (10% avg return)
- **VXUS**: International Stocks (5% avg return)
- **BND**: US Bonds (4% avg return)
- **BTC**: Bitcoin (20% avg return, high volatility)

#### 3. Portfolio Mix
- **Command**: `/mix <pct> <etf> <pct> <etf> ...`
- Blend multiple ETFs with custom allocations
- Calculates weighted average return, fee, crash impact
- Preset buttons: 60/40, 80/20, 70/30, 50/50

#### 4. Goal Calculator
- **Command**: `/goal <target> <years> <return%>`
- Reverse DCA: how much to invest weekly/monthly to reach target
- Presets for $500k and $1M goals

#### 5. Compare
- **Commands**:
  - `/compare <etf1> <etf2>`
  - `/compare <w1> <y1> <r1> vs <w2> <y2> <r2>`
- Side-by-side ETF and custom scenario comparison
- Shows final value, ROI, drawdown for each

#### 6. Currency Support
- **Command**: `/currency`
- Supports USD ($), EUR (€), CHF
- Display-only (no conversion)

#### 7. Share
- Twitter share with auto-generated tweet
- Includes simulation results and bot link

#### 8. Frequency Mode
- **Command**: `/monthly`
- Toggles contribution mode between weekly and monthly
- Reuses current scenario state

#### 9. Session Save/Replay
- **Inline Actions**: Save scenario + run saved scenario
- Scope is in-memory session only (no persistence across restarts)

### UI/UX Requirements
- Inline keyboard buttons for all interactions
- Close button returns to home menu (not just delete)
- Adjustment buttons (+/- amount, years) in relevant views
- Chart visualization using QuickChart.io

### Technical Requirements
- Node.js with Telegraf framework
- No database (in-memory state)
- Rate limiting to prevent abuse
- Graceful shutdown handling
- Unit tests for core functions

### Success Metrics
- User engagement (simulations run)
- Share rate (Twitter shares)
- Return rate (users coming back)

### Roadmap (Not Shipped Yet)
- Database for user persistence
- More ETFs (ARKK, VGT, SPY)
- Referral tracking
- Multi-language support
- Premium features (detailed reports, notifications)
