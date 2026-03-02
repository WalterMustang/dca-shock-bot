# DCA Shock Bot

A Telegram bot that simulates Dollar Cost Averaging (DCA) investment strategies with market shock modeling. Visualize how your weekly investments could grow over time, and see the impact of market crashes on your portfolio.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-blue)

## Features

### Core Simulation
- **Weekly DCA contributions** with compound interest
- **Customizable annual returns** (-100% to +200%)
- **Optional management fees** (0-5% annually)
- **Market shock simulation** - model crashes at specific years
- **Recovery tracking** - see how long it takes to recover from crashes

### Output Metrics
- Total contributed amount
- Final portfolio value
- Total gains with **ROI percentage**
- Maximum drawdown percentage
- Recovery time (weeks) after shock events

### Interactive UI
- Real-time chart visualization (via QuickChart)
- Inline buttons for quick parameter adjustments
- Preset scenarios (Base, Bull, Pain)
- Share functionality to export commands

## Quickstart (10 minutes)

### 1) Create your Telegram bot in @BotFather

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot` and follow the prompts to set a bot name and username.
3. Copy the bot token BotFather returns.

**Checkpoint:** You should now see a bot token that looks like `123456789:AA...`.

### 2) Clone this repository and install dependencies

```bash
git clone https://github.com/WalterMustang/dca-shock-bot.git
cd dca-shock-bot
npm install
```

**Checkpoint:** You should now see `npm install` complete without errors.

### 3) Set `BOT_TOKEN`

Use the token from BotFather.

**Linux/macOS (bash/zsh):**

```bash
export BOT_TOKEN="your-telegram-bot-token"
```

**Windows (PowerShell):**

```powershell
$env:BOT_TOKEN="your-telegram-bot-token"
```

**Checkpoint:** You should now have `BOT_TOKEN` available in your current terminal session.

### 4) Start the bot and verify commands

```bash
npm start
```

Then open Telegram and send:
- `/start`
- `/help`

**Checkpoint:** You should now see the welcome/help responses from your bot.

### 5) Troubleshooting

- **“401 Unauthorized”**
  - Your `BOT_TOKEN` is invalid or incomplete.
  - Re-copy the token from BotFather and set it again.
  - **You should now see** the bot start successfully after restarting with `npm start`.

- **Bot not responding**
  - The bot process may not be running.
  - Confirm `npm start` is still active and there are no runtime errors in the terminal.
  - **You should now see** replies after sending `/start` again.

- **Privacy mode / permissions**
  - In groups, Telegram bots with privacy mode enabled only receive certain messages.
  - Use commands like `/help@YourBotUsername` in groups, or disable privacy mode via BotFather if appropriate.
  - Ensure the bot has permission to read/send messages in the chat.
  - **You should now see** command responses once privacy mode and permissions are configured correctly.

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | Show usage examples and preset buttons |
| `/dca <weekly> <years> <return> [options]` | Run custom simulation |
| `/etf` | Show all ETF presets with historical returns |
| `/base` | Preset: $100/wk, 10yr, 7%, -30% shock at year 3 |
| `/bull` | Preset: $100/wk, 10yr, 12%, no shock |
| `/pain` | Preset: $100/wk, 10yr, 7%, -50% shock at year 2 |
| `/compare <etf1> <etf2>` | Compare two ETF presets side-by-side |
| `/compare <w1> <y1> <r1> vs <w2> <y2> <r2>` | Compare two custom scenarios |
| `/ping` | Health check |

### ETF Presets

Quick commands to simulate popular ETFs with their historical average returns:

| Command | ETF | Avg Return | Fee | Typical Crash |
|---------|-----|------------|-----|---------------|
| `/voo` | S&P 500 (VOO) | 10.5% | 0.03% | -35% |
| `/qqq` | Nasdaq 100 (QQQ) | 14% | 0.20% | -50% |
| `/vti` | Total US Market | 10% | 0.03% | -35% |
| `/vxus` | International | 5% | 0.08% | -40% |
| `/bnd` | US Bonds | 4% | 0.03% | -10% |
| `/btc` | Bitcoin | 50% | 0% | -70% |

*Returns based on long-term historical averages. Past performance does not guarantee future results.*

### Command Syntax

```
/dca <weekly_amount> <years> <annual_return> [fee <fee_pct>] [shock <shock_pct> at <year>]
```

### Examples

```bash
# Basic: $100/week for 10 years at 8% return
/dca 100 10 8

# With a -30% market crash at year 3
/dca 100 10 8 shock -30 at 3

# With 0.2% annual fee and shock
/dca 100 10 8 fee 0.2 shock -30 at 3

# Higher contributions
/dca 500 20 10 shock -40 at 5

# Compare two ETF presets
/compare voo qqq

# Compare two custom scenarios
/compare 100 10 8 vs 100 10 12

```

### Interactive Buttons

| Button | Action |
|--------|--------|
| `$-50/wk` / `$+50/wk` | Adjust weekly contribution |
| `Yrs -1` / `Yrs +1` | Adjust investment duration |
| `-2%` / `+2%` | Adjust expected annual return |
| `Shock %` | Toggle shock on/off (shows current %) |
| `Worse` | Increase shock severity by 10% |
| `VOO` / `QQQ` / `VTI` / `BTC` | Load ETF preset with historical returns |
| `Base` / `Bull` / `Pain` | Load preset scenarios |
| `Share` | Export full results with command |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Telegram Bot API token |
| `NODE_ENV` | No | Set to `test` for running tests |

### Parameter Limits

| Parameter | Min | Max | Default |
|-----------|-----|-----|---------|
| Weekly Amount | $0 | $1,000,000 | $100 |
| Years | 0 | 50 | 10 |
| Annual Return | -100% | 200% | 7% |
| Annual Fee | 0% | 5% | 0% |
| Shock | -95% | 0% | -30% |

## How It Works

### DCA Simulation Algorithm

1. **Weekly compounding**: Converts annual return to weekly rate using `(1 + annual)^(1/52) - 1`
2. **For each week**:
   - Add weekly contribution
   - Apply weekly return (compound growth)
   - Deduct weekly fee equivalent
   - If shock week: apply shock percentage
   - Track peak value and drawdown
3. **Calculate metrics**: ROI, max drawdown, recovery time

### Chart Generation

Uses [QuickChart.io](https://quickchart.io) to generate clean, Apple-style line charts with:
- Blue line (#007AFF) with gradient fill
- Minimal axes for clean appearance
- Automatic downsampling for large datasets

## Development

### Running Tests

```bash
npm test
```

The test suite includes 31 unit tests covering:
- Utility functions (escaping, number conversion, clamping)
- Financial calculations (weekly rate/fee conversion)
- Parameter validation
- DCA simulation engine
- Command parsing

### Project Structure

```
dca-shock-bot/
├── index.js          # Main bot logic (~750 lines)
├── index.test.js     # Unit tests (31 tests)
├── package.json      # Dependencies and scripts
├── package-lock.json # Lock file
├── Dockerfile        # Container configuration
├── .nvmrc            # Node version (20)
└── README.md         # This file
```

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: [Telegraf](https://telegraf.js.org/) v4.16
- **Charts**: [QuickChart.io](https://quickchart.io)
- **Deployment**: Docker / Railway / Any Node.js host

## Railway → Render Migration (Step-by-Step)

This bot currently runs with **long polling** (not Telegram webhook mode), so the easiest Render setup is a **Background Worker**.

### 1) Prepare your repo

1. Push your latest code to GitHub.
2. Confirm your `Dockerfile` is present (it is in this project).
3. Make sure you have your Telegram `BOT_TOKEN` from [@BotFather](https://t.me/BotFather).

### 2) Create a Render Background Worker

1. Log in to Render.
2. Click **New +** → **Background Worker**.
3. Connect your GitHub repository.
4. Select the branch you want to deploy.

### 3) Configure build/start

If using Docker (recommended for this repo):

- **Environment**: `Docker`
- **Dockerfile Path**: `./Dockerfile`
- **Start Command**: leave empty (Docker `CMD ["npm", "start"]` is already defined)

If using Native Node instead of Docker:

- **Build Command**: `npm install --omit=dev`
- **Start Command**: `npm start`

### 4) Add environment variables

In Render service settings, add:

- `BOT_TOKEN` = your real Telegram bot token (required)
- `NODE_ENV` = `production` (optional but recommended)

### 5) Deploy

1. Click **Create Background Worker** / **Deploy**.
2. Open Render logs and verify you see a successful start (for example: bot launch message).
3. In Telegram, send `/start` to your bot and confirm it replies.

### 6) Disable Railway service

After Render is confirmed working:

1. Stop/suspend your Railway deployment.
2. Keep only one active deployment to avoid confusion and duplicate maintenance.

### Notes / Troubleshooting

- Long polling bots should run as **Background Worker**, not **Web Service**.
- If your Render free tier sleeps or does not support always-on worker behavior, bot responses can be delayed while waking up.
- If you decide to use Render Web Service later, you must refactor the bot to Telegram webhook mode (HTTP server + webhook route).

## License

MIT License - feel free to use, modify, and distribute.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Submit a pull request

## Disclaimer

This bot is for **educational and entertainment purposes only**. It does not constitute financial advice. Past performance does not guarantee future results. Always consult a qualified financial advisor before making investment decisions.
