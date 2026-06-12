# GTO Texas Hold'em Academy - Implementation Plan

We will build a state-of-the-art, stunning, and highly educational **GTO Texas Hold'em Academy** web application. The design will be premium and responsive, styled with handcrafted **Vanilla CSS** (incorporating glassmorphism, dynamic gradients, elegant micro-animations, and custom poker elements) to deliver an outstanding user experience.

The app will be divided into two core interactive sections:
1. **GTO Range Board**: A dynamic, interactive 13x13 grid showing Game Theory Optimal (GTO) opening, calling, and 3-betting ranges across all poker table seats (from UTG to BB).
2. **GTO 9-Max Simulator**: A beautiful visual poker table (up to 9 players) supporting random/custom cards, multi-player seat management, step-by-step game progression, and a real-time **GTO AI Advisor** that evaluates hand strength, calculates board texture, calculates exact card equities using a Monte Carlo engine, and recommends GTO-optimal moves.

---

## Technical Architecture & Core Algorithms

### 1. High-Performance Hand Evaluator (`evaluator.js`)
We will write a native JavaScript poker hand evaluator that:
- Converts a set of cards (e.g. `As` = Ace of spades, `Th` = Ten of hearts) into a unique numeric rank.
- Evaluates any 5, 6, or 7 card hand by finding the best 5-card combination.
- Categorizes hands into 10 groups (Royal Flush down to High Card) with detailed sub-descriptions (e.g., "Flush, Jack High", "Two Pair, Aces and Tens").
- Includes a **Monte Carlo simulator** that executes 1,000-2,000 runs in under ~15ms to calculate exact win/tie equities for active players at any stage (Preflop, Flop, Turn, River).

### 2. GTO Preflop Range Database (`gto-preflop.js`)
We will encode standard GTO pre-flop opening ranges (Raise First In, RFI) and defensive actions (Facing RFI, 3-Bet, Fold) for:
- 9-Max positions: **UTG, UTG+1, MP, LJ, HJ, CO, BTN, SB, BB**.
- These will be compressed into range formulas (e.g., `AA-88, AJs+, AQo+`) and parsed dynamically into the interactive 13x13 grid.
- Each grid cell will represent the suited, offsuit, or pocket pair hand, with colored mixed-action splits (e.g. 70% Raise [Red], 30% Fold [Blue]).

### 3. GTO Postflop Game Engine & AI Advisor (`gto-postflop.js` & `poker-game.js`)
- **Game Engine**: Tracks dealer button, active players, pot size, current street (Preflop, Flop, Turn, River), player stacks, and current bets. It processes moves (Fold, Check, Call, Bet, Raise) dynamically.
- **Board Texture Analyzer**: Automatically identifies wet/dry boards, paired boards, monotone boards, flush draws, straight draws, and street-specific dynamics.
- **GTO AI Advisor**: Applies fundamental GTO game theory rules (Range Advantage, Nut Advantage, Stack-to-Pot Ratio - SPR, Blocker Effects, and polarization) to recommend the optimal action.
  - Generates realistic multi-action percentages (e.g., *Check 40%, Bet 33% Pot 50%, Bet 75% Pot 10%*).
  - Provides a rich, educational **"GTO Strategic Analysis"** panel explaining *why* the recommended action is correct based on position, range advantages, and blockers.

---

## Proposed Directory Structure
We will create this project in `C:\Users\Michael\.gemini\antigravity\scratch\gto-poker-academy`.

```
gto-poker-academy/
│
├── index.html                   # Shell & main page layout (Tabs: Learn GTO, Simulator)
│
├── css/
│   ├── base.css                 # Reset, scrollbars, premium dark themes, typography
│   ├── gto-board.css            # Styles for the 13x13 pre-flop range grid and hover charts
│   ├── simulator.css            # Styling for the interactive SVG/DOM poker table & cards
│   └── components.css           # Modal selectors, range sliders, AI advisor dashboard
│
└── js/
    ├── app.js                   # Application bootstrap, navigation tab manager, global state
    ├── evaluator.js             # High-speed poker hand evaluator & Monte Carlo simulator
    ├── gto-preflop.js           # Compact GTO preflop range charts and parsing logic
    ├── gto-postflop.js          # Board analyzer, game state heuristics, GTO advice generator
    ├── poker-game.js            # Main Texas Hold'em state machine (pot, stack, round logic)
    └── ui-manager.js            # Renders table layout, seat cards, chips, active rings, charts
```

---

## UI/UX Design System (Premium & Aesthetic)

To guarantee a **"WOW" first impression**, we will design a highly futuristic, sleek **Cyber-Dark & Emerald** aesthetic:
- **Palette**:
  - Deep space background: `#090e16`
  - Secondary card panels: `#131b26` (semi-transparent glassmorphism with `backdrop-filter: blur(12px)`)
  - Accent neon green (poker-themed): `#00ff9d`
  - Highlighting red (raises/bets): `#ff4d4d`
  - Highlighting blue (calls): `#3b82f6`
  - Highlighting gray (folds/checks): `#6b7280`
- **Typography**: Imports **Google Font "Outfit"** or **"Inter"** for clean, modern tabular numbers and readable poker analytics.
- **Micro-Animations**:
  - CSS-animated chip dealing and card distribution.
  - Floating pills for actions (e.g., "+$50" or "Check" popping up above players).
  - Highlighting rings around active players with glowing neon borders.
  - Hover glow effects on the 13x13 starting hand grid.

---

## Proposed Components & Features

### Plate 1: GTO Range Board (Learning Section)
- **Top Control Bar**:
  - Position Selectors (UTG, MP, CO, BTN, SB, BB).
  - Situation Selectors (RFI - Raise First In, facing UTG Raise, facing BTN Raise, etc.).
- **Interactive 13x13 Grid**:
  - Diagonal cells: Pairs (`AA`, `KK`, `QQ`...).
  - Top-Right triangle: Suited hands (`AKs`, `AQs`...) with a subtle soft blue border.
  - Bottom-Left triangle: Offsuit hands (`AKo`, `AQo`...) with a subtle soft orange border.
  - Each cell shows its optimal action mixture. Hovering displays a popover chart showing exact frequencies, combo counts, and strategic tips.
- **Range Summary Statistics**:
  - Total Hands played in this range (%).
  - Breakdown by action: Open Raise %, Call %, Fold %, 3-Bet %.
  - Interactive "Hand Solver" search box: type any hand (e.g., "KhQs") to immediately focus and highlight its GTO action.

### Plate 2: GTO 9-Max Table Simulator
- **Visual Poker Table**:
  - Responsive virtual green/dark felt oval table with realistic seat layouts.
  - Support for 2 to 9 players (configurable via a simple slider).
  - Dynamic button (`D`), Small Blind (`SB`), and Big Blind (`BB`) assignments.
  - Interactive card click: clicking a player's seat or community card slots opens a beautiful **Glassmorphism Card Selector Modal** allowing users to pick suits and ranks or click "Random".
- **Action Dashboard (Bottom Bar)**:
  - Input actions for the active player. It adapts to the game state (e.g., if a previous player bets $10, options change to "Fold", "Call $10", "Raise to $X" with an elegant slider).
  - Options to "Reset Hand", "Deal Next Card", or "Auto-Simulate".
- **GTO AI Advisor Sidebar**:
  - **Live Hand Strength & Equity**: Displays exactly what hand category the player currently holds (e.g., "Middle Pair with Backdoor Flush Draw") and runs the Monte Carlo simulator to show the exact win/tie percentages!
  - **Action Recommendation Bar Chart**: Visually shows the percentage weights of GTO decisions.
  - **GTO Tactical Commentary**: A rich markdown text section explaining the mathematical basis for the GTO advice.
