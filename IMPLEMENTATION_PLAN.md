# Implementation Plan

## Completed Features ✓

### Phase 1: Core Bot (Done)
- [x] Basic /dca command with simulation
- [x] Chart generation via QuickChart.io
- [x] Inline keyboard with adjustment buttons
- [x] Preset scenarios (base, bull, pain)
- [x] Rate limiting
- [x] Graceful shutdown

### Phase 2: ETF Support (Done)
- [x] ETF presets (VOO, QQQ, VTI, VXUS, BND, BTC)
- [x] /etf command with explanations
- [x] ETF buttons in keyboard
- [x] Realistic return expectations (BTC: 20%)

### Phase 3: Advanced Features (Done)
- [x] Goal Calculator (/goal)
- [x] Compare ETFs (/compare)
- [x] Portfolio Mix (/mix)
- [x] Twitter Share
- [x] Milestones in results
- [x] Inflation-adjusted returns

### Phase 4: UX Polish (Done)
- [x] Improved /start onboarding
- [x] Close button → Home menu
- [x] Adjustment buttons in mix view
- [x] Currency support (USD, EUR, CHF)

### Phase 5: Documentation (Done)
- [x] README.md
- [x] LICENSE (MIT)
- [x] Unit tests (31 tests)
- [x] PRD.md
- [x] APP_FLOW.md
- [x] IMPLEMENTATION_PLAN.md
- [x] CLAUDE.md
- [x] lessons.md
- [x] progress.txt

---

## Future Roadmap

### Phase 6: Persistence (Not Started)
- [ ] Database integration (SQLite or PostgreSQL)
- [ ] Save user preferences
- [ ] Historical simulations
- [ ] User accounts

### Phase 7: More Assets (Not Started)
- [ ] Additional ETFs (ARKK, VGT, SPY, IWM)
- [ ] Custom asset creation
- [ ] Crypto beyond BTC (ETH, SOL)
- [ ] Real estate REITs

### Phase 8: Monetization (Not Started)
- [ ] Affiliate links to brokers
- [ ] Premium features (PDF reports)
- [ ] Referral tracking
- [ ] Ad integration

### Phase 9: Engagement (Not Started)
- [ ] Weekly market updates
- [ ] Portfolio reminders
- [ ] Achievement badges
- [ ] Leaderboards

---

## Technical Debt

### Known Issues
1. mix:amt handler uses wrong variable name (allocations vs allocationsAmt)
2. Duplicate code in mix adjustment handlers
3. No input sanitization for extreme values

### Refactoring Opportunities
1. Extract mix calculation logic into shared function
2. Create keyboard factory functions
3. Add TypeScript for better type safety
4. Add integration tests

---

## How to Add New Features

### Adding a New ETF
1. Add to `ETF_PRESETS` constant
2. Add command: `bot.command("newetf", ...)`
3. Update /etf list display
4. Update help text

### Adding a New Command
1. Define handler: `bot.command("newcmd", async (ctx) => {...})`
2. Add rate limiting check
3. Add keyboard with close/menu button
4. Add to /help text
5. Add tests if applicable

### Adding a New Button Action
1. Define regex pattern: `bot.action(/^pattern:(.+)$/, ...)`
2. Parse parameters from ctx.match
3. Get/update user state
4. Respond appropriately
5. Always call ctx.answerCbQuery()
