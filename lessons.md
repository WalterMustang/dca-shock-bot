# Lessons Learned

Real failures encountered during development. Read this before making changes.

---

## Chart Issues

### Problem: Chart showed "undefined" label
**Cause**: Dataset was missing explicit `label` property
**Fix**: Add `label: "Portfolio"` to dataset object
```javascript
// Wrong
datasets: [{ data: sampled, ... }]

// Right
datasets: [{ label: "Portfolio", data: sampled, ... }]
```

### Problem: Chart line not visible
**Cause**:
1. Missing `labels` array (QuickChart requires it)
2. Using JavaScript callback functions in config (can't serialize to JSON)

**Fix**:
```javascript
// Add labels array
const labels = [];
for (let i = 0; i < series.length; i += step) {
    labels.push("");  // Empty labels
}

// Don't use callbacks
// Wrong: ticks: { callback: (val) => "$" + val }
// Right: Just use static config
```

### Problem: Chart.js v3 syntax not working
**Cause**: QuickChart.io uses Chart.js v2 by default
**Fix**: Use v2 syntax
```javascript
// Wrong (v3)
scales: { x: {...}, y: {...} }

// Right (v2)
scales: { xAxes: [{...}], yAxes: [{...}] }
```

---

## Button/Keyboard Issues

### Problem: Share button showed no results
**Cause**: Not running simulation before displaying share info
**Fix**: Always run `simulateDCA(cur)` to get actual values

### Problem: Close button just deleted message
**Cause**: Only calling `ctx.deleteMessage()` without replacement
**Fix**: Delete message AND send new home menu
```javascript
bot.action("close", async (ctx) => {
    try { await ctx.deleteMessage(); } catch {}
    // Then send home menu
    await ctx.reply(homeMsg, { reply_markup: kb.reply_markup });
});
```

### Problem: Buttons stopped working after message edit
**Cause**: Telegram caches old callback data
**Fix**: Always call `ctx.answerCbQuery()` even if empty
```javascript
try { await ctx.answerCbQuery(); } catch {}
```

---

## State Management Issues

### Problem: User state not persisting between commands
**Cause**: Not saving updated state back to Map
**Fix**: Always `userState.set(userId, {...})` after modifications

### Problem: Mix adjustment used wrong variable
**Cause**: Copy-pasted code with different variable names
**Fix**: Renamed `allocations` to `allocationsAmt` in amt handler to avoid confusion

---

## Currency Issues

### Problem: Currency symbol appeared twice
**Cause**: formatMoney returns symbol, but also had hardcoded "$"
**Fix**: Remove all hardcoded "$" when using formatMoney
```javascript
// Wrong
`$${formatMoney(value, curr)}`  // Results in "$$100"

// Right
`${formatMoney(value, curr)}`   // Results in "$100"
```

---

## Git Issues

### Problem: Merge conflict with main
**Cause**: Trying to merge when main had diverged
**Fix**: Don't merge locally. Create PR on GitHub and resolve there.

### Problem: Push failed with 403
**Cause**: Pushing to wrong branch name
**Fix**: Always use the designated `claude/xxx` branch name

---

## Test Issues

### Problem: Tests failed due to missing BOT_TOKEN
**Cause**: Bot initialization requires token even in test mode
**Fix**: Add fallback for test environment
```javascript
const token = process.env.BOT_TOKEN || (isTestMode ? "test-token" : null);
```

### Problem: formatMoney test failed after adding currency
**Cause**: Function signature changed, tests not updated
**Fix**: Update tests to match new behavior
```javascript
// Old
assert.strictEqual(formatMoney(1234), "1,234");

// New
assert.strictEqual(formatMoney(1234), "$1,234");
assert.strictEqual(formatMoney(1234, "eur"), "€1,234");
```

---

## General Lessons

1. **Always run tests before committing** - `npm test`
2. **Read error messages carefully** - They usually tell you exactly what's wrong
3. **Check Telegram's API limits** - Can't edit messages older than 48 hours
4. **JSON can't serialize functions** - Don't use callbacks in chart config
5. **QuickChart uses Chart.js v2** - Use old syntax for scales, legend, etc.
6. **Always include Menu/Close button** - Users need a way out
7. **Rate limit all handlers** - Prevents abuse
8. **Update progress.txt** - Next session needs context
