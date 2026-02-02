# Claude Agent Rules

## Before Starting Any Work

1. **Read progress.txt** - Know what was done in previous sessions
2. **Read lessons.md** - Avoid repeating past mistakes
3. **Run tests** - `npm test` to verify everything works
4. **Check git status** - See if there are uncommitted changes

---

## File Structure

```
dca-shock-bot/
├── index.js          # Main bot logic (ONLY modify this for features)
├── index.test.js     # Unit tests (update when adding testable functions)
├── package.json      # Dependencies (DO NOT add new deps without asking)
├── README.md         # User documentation
├── LICENSE           # MIT license
├── PRD.md            # Product requirements
├── APP_FLOW.md       # Application flow diagrams
├── IMPLEMENTATION_PLAN.md  # Feature roadmap
├── progress.txt      # Session progress log (UPDATE after each session)
├── CLAUDE.md         # This file - agent rules
└── lessons.md        # Past failures and learnings
```

---

## Code Rules

### No New Dependencies
- Do NOT add packages to package.json without explicit user approval
- Current deps: telegraf only
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
        [Markup.button.callback("🏠 Menu", "home")]
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
- Always get currency from user state: `const curr = cur.currency || "usd";`
- Always pass to formatMoney: `formatMoney(amount, curr)`
- Never hardcode "$" in output strings

### State Management
```javascript
const cur = userState.get(userId) || clampParams({});
// Modify
userState.set(userId, { ...cur, newValue: x });
```

---

## Output Format

### Messages
- Use HTML parse mode: `parse_mode: "HTML"`
- Bold with `<b>text</b>`
- Italic with `<i>text</i>`
- Code with `<code>text</code>`
- Escape user input with `escHtml()`

### Numbers
- Use `formatMoney(value, currency)` for money
- Use `.toFixed(1)` for percentages
- Use `.toLocaleString()` for large numbers

---

## Testing

### Run Tests
```bash
npm test
```

### Test New Functions
If you add a new exported function, add tests in index.test.js

### What to Test
- Pure functions (calculations, parsing)
- Edge cases (0, negative, null, undefined)
- Don't test Telegram interactions

---

## Git Rules

### Commit Messages
```
Add <feature name>

<Brief description of what was added>

https://claude.ai/code/session_<id>
```

### Branch
- Always work on the designated feature branch
- Never push to main without PR

### Before Committing
1. Run tests: `npm test`
2. Check for linting issues
3. Update progress.txt

---

## Common Patterns

### Adding ETF Preset
```javascript
// In ETF_PRESETS constant
newetf: {
    name: "NEWETF",
    fullName: "Full Name Here",
    annualReturnPct: 10,
    annualFeePct: 0.1,
    description: "Description for users",
    typicalShock: -30
}

// Add command
bot.command("newetf", async (ctx) => { ... });
```

### Adding Keyboard Button
```javascript
Markup.button.callback("Label", "action:param")
```

### Handling Currency
```javascript
const curr = (userState.get(userId) || {}).currency || "usd";
const formatted = formatMoney(value, curr);
```

---

## What NOT to Do

1. Don't add console.log for debugging (remove before commit)
2. Don't use callback syntax for functions (JSON can't serialize)
3. Don't hardcode user messages in English only (prepare for i18n)
4. Don't create new files without asking
5. Don't modify package.json dependencies
6. Don't use Chart.js v3 syntax (QuickChart uses v2)
