# DCA Shock Bot

A fun Telegram bot that simulates weekly investing with compounding, optional annual fees, and one optional crash event (“shock”).  
It replies with a clean summary and a minimal chart image plus buttons to tweak assumptions without retyping commands.

## What it does

- Weekly DCA contributions (default: $100)
- Annual return (default: 7%)
- Optional annual fee (default: 0%)
- Optional one-time shock drawdown (example: -30% at year 3)
- Outputs:
  - Final value
  - Total contributed
  - Gains
  - Max drawdown
  - Recovery time (if shock is enabled)
  - Chart image (QuickChart)
- Interactive UI:
  - Buttons for years/return adjustments
  - Toggle shock on/off
  - Presets: Base / Bull / Pain
  - Share output

## Commands

### Main command
