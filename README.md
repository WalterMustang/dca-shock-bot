# DCA Shock Bot

A Telegram bot that simulates Dollar Cost Averaging (DCA) investment strategies with market shock modeling.
It is designed to be easy to self-host, easy to learn from, and easy to showcase as a practical Node.js project.

![Node.js](https://img.shields.io/badge/Node.js-20_LTS-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-blue)

## Why This Project Is Worth Showcasing

This project demonstrates how to build a useful Telegram bot end-to-end:
- Parsing user commands and validating input safely
- Running financial simulations with weekly compounding
- Handling market shock and recovery logic
- Rendering charts users can understand quickly
- Creating a clean interactive UX with Telegram inline buttons

If someone wants to learn by building and running a real bot on their own machine (without paying for a platform), this repo is a strong starting point.

## What You’ll Learn

- How a Telegram bot works with long polling
- How to structure a Node.js bot project
- How to model DCA growth, fees, drawdowns, and recovery periods
- How to compare multiple investment scenarios
- How to run a bot locally, in Docker, or on a small VPS

## Features

### Core Simulation
- **Weekly DCA contributions** with compound interest
- **Customizable annual returns** (-100% to +200%)
- **Optional management fees** (0-5% annually)
- **Market shock simulation** at specific years
- **Recovery tracking** after shock events

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

## Quickstart (10 Minutes)

### Prerequisites
- Node.js 20 LTS
- A Telegram Bot Token (get one from [@BotFather](https://t.me/BotFather))

Check your Node version:

```bash
node -v
```

### 2) Create your bot token
In Telegram:
1. Open [@BotFather](https://t.me/BotFather)
2. Run `/newbot`
3. Follow prompts and copy your token

### 3) Clone and install

```bash
git clone <your-fork-or-this-repo-url>
cd dca-shock-bot
npm install
```

### 4) Set environment variable

Linux/macOS:
```bash
export BOT_TOKEN="your-telegram-bot-token"
```

Windows (PowerShell):
```powershell
$env:BOT_TOKEN="your-telegram-bot-token"
```

### 5) Start the bot

```bash
npm start
```

### 6) Verify it works
Open your bot in Telegram and send:
- `/start`
- `/help`
- `/dca 100 10 8 shock -30 at 3`

You should now receive a response with metrics and a chart.

## Self-Hosting (No Paid Platform Required)

This bot uses **Telegram long polling**, so you can run it without setting up a webhook, public domain, or paid platform.

### Option A: Run on your own machine
Use the Quickstart above and keep the process running.

### Option B: Run with Docker

```bash
# Build
docker build -t dca-shock-bot .

# Run
docker run -e BOT_TOKEN="your-token" --name dca-shock-bot dca-shock-bot
```

### Option C: Run 24/7 on a VPS
Use a small VPS and a process manager (example with PM2):

```bash
npm install -g pm2
pm2 start index.js --name dca-shock-bot
pm2 save
pm2 startup
```

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

| Command | ETF | Avg Return | Fee | Typical Crash |
|---------|-----|------------|-----|---------------|
| `/voo` | S&P 500 (VOO) | 10.5% | 0.03% | -35% |
| `/qqq` | Nasdaq 100 (QQQ) | 14% | 0.20% | -50% |
| `/vti` | Total US Market | 10% | 0.03% | -35% |
| `/vxus` | International | 5% | 0.08% | -40% |
| `/bnd` | US Bonds | 4% | 0.03% | -10% |
| `/btc` | Bitcoin | 50% | 0% | -70% |

*Returns are based on long-term historical averages. Past performance does not guarantee future results.*

### Command Syntax

```text
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

## Troubleshooting

- **401 Unauthorized**: Your `BOT_TOKEN` is invalid or has extra spaces/quotes.
- **Bot does not reply**: Check the process is still running and no startup errors were logged.
- **No response in group chats**: Review BotFather privacy mode and bot permissions.

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

1. Convert annual return to weekly rate: `(1 + annual)^(1/52) - 1`
2. For each week:
   - Add weekly contribution
   - Apply weekly return
   - Deduct weekly fee
   - Apply shock at configured week (if any)
   - Track peak, drawdown, and recovery
3. Return final metrics and render chart URL via QuickChart

## Development

### Run tests

```bash
npm test
```

### Project Structure

```text
dca-shock-bot/
├── index.js          # Main bot logic
├── index.test.js     # Unit tests
├── package.json      # Dependencies and scripts
├── package-lock.json # Lock file
├── Dockerfile        # Container configuration
├── .nvmrc            # Node version
└── README.md         # Documentation
```

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Framework**: [Telegraf](https://telegraf.js.org/) v4.16
- **Charts**: [QuickChart.io](https://quickchart.io)
- **Deployment**: Local machine / Docker / VPS
