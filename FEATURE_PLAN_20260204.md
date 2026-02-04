# FEATURE_PLAN_20260204

## 1. Executive Summary
The biggest opportunity is to turn this already-complete DCA bot into a habit-forming, shareable learning loop that helps users build conviction over time, not just run one-off simulations. The journey today ends after a single chart; we can compound value by adding lightweight personalization, “next best action” nudges, and a few trust-building explanations that make results feel credible and actionable. Because the core simulation and ETF logic already exist, we should focus on finishing user loops (save, compare, return, share) rather than expanding the feature surface. This plan avoids heavy infra changes and keeps every feature additive, minimizing risk to current functionality.

## 2. Current State
**What’s working**
- Core simulation, ETF presets, mix, goal, compare, and share flows are complete and stable. The bot already has solid UX polish (inline buttons, close/menu) and a consistent chart experience. It’s ready for “productization” rather than more core math.

**What’s almost there**
- UX flows exist but end abruptly after results. There’s no continuity: users can’t easily “save a scenario,” “return later,” or “continue a journey” without retyping or memorizing commands.

**What’s missing**
- Retention hooks (returning users don’t get a tailored entry point).
- Trust builders (lightweight contextual explanations and assumptions disclosure).
- Sharing mechanics that convert curiosity into new users (e.g., friend-friendly summaries).

**What’s at risk**
- Without persistence, personalization must stay lightweight and ephemeral. Any feature that implies “history” should be explicit about its temporary nature unless Phase 2 introduces minimal persistence.

**Known constraints & gaps in docs**
- TECH_STACK.md, DESIGN_SYSTEM/TOKENS.md, FRONTEND_GUIDELINES.md, and BACKEND_STRUCTURE.md are not present. This plan therefore prioritizes additive, text-first interactions that fit existing patterns and avoids UI architecture changes or new data stores until clarified.

**Live experience**
- Bot link: https://t.me/DcaShockBot (used as the canonical entry point for flow thinking).

## 3. Phase 1: Ship This Week (High impact, low effort)
**Goal:** Finish the “one simulation → meaningful next step” loop with minimal changes.

### 3.1 “Continue Your Journey” CTA
- **What it does:** After any simulation result, present a short, single-line CTA that offers the next best action (e.g., “Try a higher return,” “Compare vs VTI,” “Set a target goal”).
- **Why now:** Converts one-off results into a sequence of actions, increasing engagement without adding new endpoints.
- **Builds on:** Existing keyboard flow and callback handling.
- **Doesn’t touch:** Simulation engine, ETF presets, or charting.
- **Implementation context:** Reuse existing inline keyboard patterns; choose one CTA based on the last command (e.g., /dca → /compare, /mix → /goal).

### 3.2 “Assumptions & Caveats” Micro-Panel
- **What it does:** Adds a brief, standardized 2–3 line disclaimer in results explaining compounding, return assumptions, and non-advice positioning.
- **Why now:** Increases credibility and reduces user confusion about why results look “too good,” improving trust.
- **Builds on:** buildCaption output and help text patterns.
- **Doesn’t touch:** Math logic or QuickChart.
- **Implementation context:** Prepend/append a consistent snippet, localized to existing currency/return fields.

### 3.3 “One-Tap Scenario Save (Temporary)”
- **What it does:** “Save” button that pins the current command string for quick re-run within the same session (explicitly labeled as temporary).
- **Why now:** Solves the “I want to revisit this scenario” problem without adding persistence.
- **Builds on:** Existing Share and command reconstruction logic.
- **Doesn’t touch:** Data storage (no DB).
- **Implementation context:** Store the last command in in-memory user state, and show a “Run Saved Scenario” button.

### 3.4 “Friend-Ready Share Summary”
- **What it does:** Adds a short “TL;DR” line to the share output: contribution, final value, and timeframe in a human sentence.
- **Why now:** Increases virality by making the shared message understandable without context.
- **Builds on:** Current Share flow.
- **Doesn’t touch:** Charting or the Twitter share mechanism itself.
- **Implementation context:** Use existing computed values; format a one-liner with currency formatting.

## 4. Phase 2: Ship This Sprint (More effort, significant value)
**Goal:** Add lightweight personalization and deeper trust without breaking the no-DB constraint.

### 4.1 “Personal Baseline” Setup
- **What it does:** A single-step prompt to set “My weekly amount” and “My default horizon,” used as defaults for future commands.
- **Why now:** Users want to simulate their own reality; retyping is a clear friction point.
- **Builds on:** userState Map and clampParams.
- **Doesn’t touch:** ETF logic or charting.
- **Implementation context:** Use /start or /settings to set defaults, stored in memory only with explicit “session only” labeling.

### 4.2 “Compare vs. Your Baseline” Mode
- **What it does:** When running an ETF or mix, show a small delta vs the user’s baseline (if set).
- **Why now:** Makes results instantly meaningful and sticky, without new analytics.
- **Builds on:** Compare logic and existing computation output.
- **Doesn’t touch:** Core simulation functions beyond adding an additional run.
- **Implementation context:** Run a quick baseline simulation with stored defaults and show delta in the caption.

### 4.3 “Shock Recovery Story”
- **What it does:** Adds a short sentence: “You recovered the crash in X weeks” for any shock scenario.
- **Why now:** Converts a scary chart into a reassuring narrative; increases comprehension and emotional payoff.
- **Builds on:** Existing recovery tracking already mentioned in README and simulation logic.
- **Doesn’t touch:** UI structure or new commands.
- **Implementation context:** Surface existing recovery metrics in the result caption.

### 4.4 “Scenario Templates”
- **What it does:** Introduce 2–3 new contextual templates (e.g., “New Parent Plan,” “Early Retiree Plan,” “Crash Test”).
- **Why now:** Helps novices who don’t know what numbers to input; reduces cognitive load.
- **Builds on:** Preset system and existing buttons.
- **Doesn’t touch:** ETF data.
- **Implementation context:** Add buttons that set common parameters; clearly describe each in one line.

### 4.5 “Explain This Result” Toggle
- **What it does:** A help toggle that expands a short, structured explanation (contributions vs. gains, shock impact, ROI definition).
- **Why now:** Learners need interpretation to trust results.
- **Builds on:** Help text and buildCaption.
- **Doesn’t touch:** Data or charts.
- **Implementation context:** Add a button that swaps to an explanatory caption and back.

## 5. Phase 3: Ship This Quarter (Strategic investment)
**Goal:** Build moats with persistence, lifecycle engagement, and professional outputs.

### 5.1 Minimal Persistence (Lightweight DB)
- **What it does:** Saves user defaults, last 3 scenarios, and preferred currency.
- **Why now:** Enables meaningful retention and continuity, a prerequisite for future engagement features.
- **Builds on:** userState; create a thin persistence layer.
- **Doesn’t touch:** Calculation logic.
- **Implementation context:** Start with SQLite or a simple key-value store; keep data model tiny.

### 5.2 “Return Journey” Notifications
- **What it does:** Optional weekly reminder with a quick “rerun” button for their saved scenario.
- **Why now:** Drives return rate (success metric) with zero additional user friction.
- **Builds on:** Persistence and existing simulation routines.
- **Doesn’t touch:** Core ETF sets.
- **Implementation context:** Opt-in only; store schedule preferences.

### 5.3 “Pro Report” Export
- **What it does:** Generates a PDF-like summary or extended text report of a scenario.
- **Why now:** Monetization lever and professional-grade output; useful for sharing with advisors or family.
- **Builds on:** Existing simulation results and chart URL.
- **Doesn’t touch:** Core calculation engine.
- **Implementation context:** Keep it simple: single-page summary with chart + metrics.

### 5.4 “Portfolio Laddering” Mix Builder
- **What it does:** Allows multi-period allocations (e.g., 80/20 for 5 years, then 60/40).
- **Why now:** Differentiates from commodity DCA calculators; aligns with real investing journeys.
- **Builds on:** Mix functionality.
- **Doesn’t touch:** ETF preset definitions beyond reuse.
- **Implementation context:** Model as staged mixes and run a stitched simulation.

## 6. Parking Lot
- Multi-language support (needs i18n foundation).
- In-app broker affiliate links (requires compliance review).
- Community “public scenarios” gallery (requires moderation).
- Crypto portfolio packs (risk of skewing user trust).

## 7. Rejected Ideas (for now)
1. **Real-time market data feed** — increases complexity and reliability risk without clear user journey value.
2. **Full user accounts with OAuth** — overkill for current bot scope; adds heavy privacy obligations.
3. **Leaderboard / social competition** — misaligned with long-term investing mindset and could feel gimmicky.
4. **AI investment advisor mode** — high compliance and trust risk; not necessary to increase engagement.

## 8. Dependency Map
- **Phase 1** features are independent; can ship in any order.
- **Phase 2** depends on Phase 1’s CTA and save flow for best impact (baseline setup should exist before baseline comparison).
- **Phase 3** requires persistence first (5.1) before notifications (5.2) and pro reports (5.3).
- Laddering (5.4) can ship after persistence but does not require it.

---

**Proceed?**
I will wait for explicit approval before any phase execution. This plan is ready for review and refinement.
