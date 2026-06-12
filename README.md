# 🃏 GTO Texas Hold'em Academy

A premium, interactive, and highly educational web application for mastering **Game Theory Optimal (GTO)** poker strategies. Built with high-performance native ES6 modules and a custom-crafted Cyber-Dark & Emerald design system.

---

## 🌐 Live Demo & GitHub Pages

Since this project has a **no-build, zero-dependency architecture**, you can host it directly on **GitHub Pages** with one click. 

Once deployed, the app will run instantly in any modern web browser on both desktop and mobile devices.

---

## 🚀 Key Features

### 1. Interactive GTO Preflop Range Board
* **13x13 Starting Hand Grid**: Displays opening, calling, and 3-betting ranges across all poker table seats (from UTG to BB).
* **Mixed-Strategy Rendering**: Grid cells are color-coded proportionally (Red for Raise, Blue for Call, Green for Check, Gray for Fold) to represent mixed-decision GTO frequencies.
* **Hover Popovers**: Hovering over any starting hand combination reveals detailed exact percentages and tactical suggestions.
* **Range Statistics Panel**: Aggregates real-time values including Total Played Range %, Value Raise %, and Defense % under selected seats and scenarios (RFI, Facing RFI).

### 2. Interactive GTO 9-Max Simulator
* **Cyber felt oval table**: A responsive, sleek virtual table supporting 2-player (Heads Up), 6-player, or 9-player (Full Ring) configurations.
* **Card Selector Modals**: Click on any player seat or community card slot to assign specific suits and ranks or deal a random card.
* **Real-time Monte Carlo Simulator**: Conducts 1,500+ game runs in less than ~15ms on a single thread to compute precise winning equities for active players dynamically at any street (Preflop, Flop, Turn, River).
* **GTO AI Heuristics Advisor**: Automatically categorizes hand strength tiers (Top Pair, Straight Flush, Gutshot, etc.), analyzes board coordination wetness, and yields recommended GTO action weights paired with educational structural rationale text.

---

## 📂 Project Structure

```
gto-poker-academy/
│
├── index.html                   # Core Application Entry Point
├── README.md                    # Project Documentation (This file)
├── package.json                 # Project descriptor (ES6 enabled, test runner)
├── chat_history.md              # Live-exported engineering conversation logs
│
├── css/                         # Custom Styling (Handcrafted Premium Vanilla CSS)
│   ├── base.css                 # Theme variables, layouts, resets, and tab routing
│   ├── gto-board.css            # Styles for 13x13 preflop ranges grid
│   ├── simulator.css            # Styles for virtual poker felt table and card displays
│   └── components.css           # Modals, custom sliders, and AI Advisor panels
│
├── js/                          # High-performance Vanilla Javascript (ES6 Modules)
│   ├── app.js                   # Application bootstrap & settings liaison
│   ├── evaluator.js             # 7-Card hand evaluator & Monte Carlo simulation
│   ├── gto-preflop.js           # Compressed GTO preflop charts and range parsing
│   ├── gto-postflop.js          # Board texture analyzer & GTO decision heuristics
│   ├── poker-game.js            # 9-Max Texas Hold'em state machine
│   └── ui-manager.js            # Table renderer, chips, action highlighting, and charts
│
└── scripts/                     # Helper Scripts
    ├── test_core.js             # Core unit testing suite
    └── export_history.py        # Synchronizes engineering conversation logs
```

---

## 🛠️ Local Development & Testing

To run the unit tests and verify the hand evaluator and Monte Carlo engine:

1. Ensure [Node.js](https://nodejs.org/) is installed.
2. Run the test script:
   ```bash
   npm test
   ```

---

## 📤 Step-by-Step GitHub Pages Deployment Guide

To deploy this project to GitHub Pages so that anyone can access it via a URL:

### Step 1: Create a GitHub Repository
1. Log in to [GitHub](https://github.com/).
2. Click **New** to create a new repository.
3. Name it `gto-poker-academy` (or any name you prefer).
4. Set the repository to **Public** (required for free GitHub Pages).
5. Leave "Add a README", ".gitignore", and "Choose a license" **unchecked** (since we already have local files).
6. Click **Create repository**.

### Step 2: Push Local Files to GitHub
Open your terminal (PowerShell or Git Bash) in your local project folder (`C:\Users\Michael\.gemini\antigravity\scratch\gto-poker-academy`) and run the following commands:

```bash
# Initialize local git repository
git init

# Add all files to staging area
git add .

# Create initial commit
git commit -m "feat: initial release of gto poker academy"

# Rename branch to main
git branch -M main

# Link to your remote GitHub repository (replace with your actual GitHub username)
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/gto-poker-academy.git

# Push files to GitHub
git push -u origin main
```

*(Alternatively, you can drag and drop your project folder directly into the GitHub web interface or use [GitHub Desktop](https://desktop.github.com/)).*

### Step 3: Enable GitHub Pages
1. Go to your repository page on GitHub.
2. Click on the **Settings** tab.
3. In the left sidebar, click on **Pages** (under the "Code and automation" section).
4. Under **Build and deployment**, select **Deploy from a branch** as the Source.
5. Under **Branch**, select **`main`** and **`/ (root)`**.
6. Click **Save**.

### Step 4: Access Your Live Site!
Within 1-2 minutes, GitHub will build and host your site. A notification banner with your live URL will appear at the top of the **Pages** settings screen. 

The format of the URL will be:
`https://YOUR_GITHUB_USERNAME.github.io/gto-poker-academy/`

---

## 📝 Sync Conversation Logs
This project was built collaboratively with **Antigravity (AI)**. To append subsequent conversation steps into your repository, run:
```bash
python scripts/export_history.py
```
