/* --- UI Manager: Grid Renderers, Table Graphics, and Modal Handlers --- */

import { coordsToHand, getStrategyGrid } from './gto-preflop.js';
import { runMonteCarlo, SUIT_SYMBOLS } from './evaluator.js';
import { getGTOAdvice, classifyHandStrength, analyzeBoardTexture } from './gto-postflop.js';

export class UIManager {
  constructor(game) {
    this.game = game;
    this.selectedPosition = 'BTN';
    this.selectedSituation = 'RFI';
    
    // Card selection state
    this.activeSelectTarget = null; // { type: 'player'|'community', id: playerIdx|cardIdx, cardSlot: 0|1 }
  }

  /**
   * Initializes DOM elements and setups event handlers.
   */
  init() {
    this.setupTabHandlers();
    this.setupPreflopTab();
    this.setupSimulatorTab();
    this.setupCardSelectorModal();
  }

  // --- Tab Switcher Logic ---
  setupTabHandlers() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        document.getElementById(targetId).classList.add('active');

        // Refresh view when switching tabs
        if (targetId === 'learn-gto') {
          this.renderPreflopGrid();
        } else if (targetId === 'simulator') {
          this.renderPokerTable();
          this.updateGTORecommendations();
        }
      });
    });
  }

  // --- Learn Preflop Section ---
  setupPreflopTab() {
    // Listeners for position selectors
    const posBtns = document.querySelectorAll('#preflop-positions .selector-btn');
    posBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        posBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedPosition = btn.getAttribute('data-pos');
        this.renderPreflopGrid();
      });
    });

    // Listeners for situation selectors
    const sitBtns = document.querySelectorAll('#preflop-situations .selector-btn');
    sitBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sitBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSituation = btn.getAttribute('data-sit');
        this.renderPreflopGrid();
      });
    });

    // Search and focus hand solver
    const searchInput = document.getElementById('hand-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        this.highlightSearchedHand(val);
      });
    }

    this.renderPreflopGrid();
  }

  renderPreflopGrid() {
    const gridContainer = document.getElementById('starting-hand-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';
    const gridData = getStrategyGrid(this.selectedPosition, this.selectedSituation);

    // Calculate aggregated statistics
    let totalHands = 0;
    let raiseSum = 0;
    let callSum = 0;
    let checkSum = 0;
    let foldSum = 0;

    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const cell = gridData[r][c];
        const cellEl = document.createElement('div');
        cellEl.className = 'hand-cell';
        cellEl.setAttribute('data-hand', cell.hand);

        // Grid boundaries color-code helpers
        if (r === c) cellEl.classList.add('pair');
        else if (r < c) cellEl.classList.add('suited');
        else cellEl.classList.add('offsuit');

        // Mixed GTO Actions split background renderer
        const splitEl = document.createElement('div');
        splitEl.className = 'action-split';

        const { raise, call, check, fold } = cell.weights;

        // Sum aggregates (each combo counts differently, but for raw visualization we use simple averages)
        const playedPct = (raise + call + check);
        totalHands += playedPct;
        raiseSum += raise;
        callSum += call;
        checkSum += check;
        foldSum += fold;

        if (raise > 0) {
          const rBar = document.createElement('div');
          rBar.className = 'action-bar raise';
          rBar.style.width = `${raise}%`;
          splitEl.appendChild(rBar);
        }
        if (call > 0) {
          const cBar = document.createElement('div');
          cBar.className = 'action-bar call';
          cBar.style.width = `${call}%`;
          splitEl.appendChild(cBar);
        }
        if (check > 0) {
          const chBar = document.createElement('div');
          chBar.className = 'action-bar check';
          chBar.style.width = `${check}%`;
          splitEl.appendChild(chBar);
        }
        if (fold > 0) {
          const fBar = document.createElement('div');
          fBar.className = 'action-bar fold';
          fBar.style.width = `${fold}%`;
          splitEl.appendChild(fBar);
        }

        cellEl.appendChild(splitEl);

        // Hand Label text
        const labelEl = document.createElement('span');
        labelEl.className = 'hand-label';
        labelEl.textContent = cell.hand;
        cellEl.appendChild(labelEl);

        // Add popover tooltip for GTO frequencies
        const popEl = document.createElement('div');
        popEl.className = 'gto-popover';
        popEl.innerHTML = `
          <div class="popover-header">${cell.hand} GTO Strategy</div>
          ${raise > 0 ? `<div class="popover-row" style="color: var(--gto-raise)"><span>Raise:</span><span>${raise}%</span></div>` : ''}
          ${call > 0 ? `<div class="popover-row" style="color: var(--gto-call)"><span>Call:</span><span>${call}%</span></div>` : ''}
          ${check > 0 ? `<div class="popover-row" style="color: var(--gto-check)"><span>Check:</span><span>${check}%</span></div>` : ''}
          ${fold > 0 ? `<div class="popover-row" style="color: var(--gto-fold)"><span>Fold:</span><span>${fold}%</span></div>` : ''}
        `;
        cellEl.appendChild(popEl);

        gridContainer.appendChild(cellEl);
      }
    }

    // Render Stats
    const totalRuns = 169;
    document.getElementById('stat-total-played').textContent = `${(totalHands / totalRuns).toFixed(1)}%`;
    document.getElementById('stat-raise-pct').textContent = `${(raiseSum / totalRuns).toFixed(1)}%`;
    document.getElementById('stat-call-pct').textContent = `${(callSum / totalRuns).toFixed(1)}%`;
    document.getElementById('stat-fold-pct').textContent = `${(foldSum / totalRuns).toFixed(1)}%`;
  }

  highlightSearchedHand(search) {
    const cells = document.querySelectorAll('.hand-cell');
    cells.forEach(cell => {
      const hand = cell.getAttribute('data-hand').toLowerCase();
      if (search && hand.startsWith(search)) {
        cell.style.transform = 'scale(1.15)';
        cell.style.boxShadow = '0 0 15px var(--accent-green-glow)';
        cell.style.zIndex = '5';
      } else {
        cell.style.transform = '';
        cell.style.boxShadow = '';
        cell.style.zIndex = '';
      }
    });
  }

  // --- Simulator Section ---
  setupSimulatorTab() {
    this.game.startNewHand();
    this.renderPokerTable();

    // Reset hand
    const resetBtn = document.getElementById('btn-reset-hand');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.game.startNewHand();
        this.renderPokerTable();
        this.updateGTORecommendations();
      });
    }

    // Next Card / Auto-advance street
    const nextBtn = document.getElementById('btn-next-street');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.game.advanceStreet();
        this.renderPokerTable();
        this.updateGTORecommendations();
      });
    }

    // Setup action buttons click events
    const actBtns = document.querySelectorAll('.action-dashboard .action-btn');
    actBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-action');
        if (!act) return;

        let amount = 0;
        if (act === 'raise') {
          const slider = document.getElementById('raise-amount-slider');
          amount = parseInt(slider?.value || 0);
        }

        this.game.processAction(act, amount);
        this.renderPokerTable();
        this.updateGTORecommendations();
      });
    });

    // Raising Slider inputs
    const raiseSlider = document.getElementById('raise-amount-slider');
    const raiseValDisplay = document.getElementById('raise-slider-value');
    if (raiseSlider && raiseValDisplay) {
      raiseSlider.addEventListener('input', (e) => {
        raiseValDisplay.textContent = `$${e.target.value}`;
      });
    }
  }

  renderPokerTable() {
    // 1. Render active seats around felt oval
    const tableEl = document.getElementById('poker-felt-table');
    if (!tableEl) return;

    // Clear old seat components but keep background logs & elements
    const oldSeats = tableEl.querySelectorAll('.player-seat, .dealer-button, .bet-chips');
    oldSeats.forEach(el => el.remove());

    const activeSeatCount = this.game.getActivePlayers().length;

    this.game.players.forEach(p => {
      const seatDiv = document.createElement('div');
      seatDiv.className = `player-seat ${!p.isActive ? 'empty' : ''} ${this.game.activePlayerIdx === p.id ? 'active' : ''}`;
      seatDiv.setAttribute('data-seat', p.id);

      if (!p.isActive) {
        seatDiv.innerHTML = `
          <div class="seat-card">
            <div class="empty-seat-placeholder">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Seat</span>
            </div>
          </div>
        `;
        // Handle seat click to sit in player
        seatDiv.addEventListener('click', () => {
          p.isActive = true;
          this.game.assignPositions();
          this.renderPokerTable();
        });
      } else {
        // Seat contains active player
        let card1Html = `<div class="poker-card empty-slot" data-slot="0"></div>`;
        let card2Html = `<div class="poker-card empty-slot" data-slot="1"></div>`;

        if (p.cards[0]) {
          card1Html = this.renderCardHtml(p.cards[0], p.id, 0);
        }
        if (p.cards[1]) {
          card2Html = this.renderCardHtml(p.cards[1], p.id, 1);
        }

        const actionText = p.hasFolded ? 'FOLDED' : (p.hasActed && p.bet > 0 ? 'BETTING' : '');

        seatDiv.innerHTML = `
          <div class="seat-card">
            <div class="seat-name">${p.name} <span style="font-size: 0.65rem; color: var(--text-secondary)">(${p.position})</span></div>
            <div class="seat-cards">
              ${card1Html}
              ${card2Html}
            </div>
            <div class="seat-chips">$${p.chips}</div>
            ${actionText ? `<div class="seat-action-label ${actionText.toLowerCase()}">${actionText}</div>` : ''}
          </div>
        `;

        // Handle seat card selections
        seatDiv.querySelectorAll('.poker-card.empty-slot, .poker-card.filled').forEach(cardEl => {
          cardEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const slot = parseInt(cardEl.getAttribute('data-slot'));
            this.openCardSelector('player', p.id, slot);
          });
        });
      }

      tableEl.appendChild(seatDiv);

      // Render Dealer (D) Button if applicable
      if (p.isActive && p.isDealer) {
        const dealerBtn = document.createElement('div');
        dealerBtn.className = 'dealer-button';
        dealerBtn.setAttribute('data-seat-btn', p.id);
        dealerBtn.textContent = 'D';
        tableEl.appendChild(dealerBtn);
      }

      // Render Current bet chips indicator
      if (p.isActive && p.bet > 0) {
        const betDiv = document.createElement('div');
        betDiv.className = 'bet-chips chip-deal-anim';
        betDiv.setAttribute('data-seat-bet', p.id);
        betDiv.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="10" cy="10" r="8" stroke="white" stroke-width="1.5" stroke-dasharray="2 1"/>
          </svg>
          $${p.bet}
        `;
        tableEl.appendChild(betDiv);
      }
    });

    // 2. Render Community Cards
    const commContainer = document.getElementById('community-cards-row');
    if (commContainer) {
      commContainer.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const cCard = this.game.communityCards[i];
        if (cCard) {
          commContainer.innerHTML += this.renderCardHtml(cCard, null, i);
        } else {
          commContainer.innerHTML += `<div class="poker-card empty-slot" data-slot="${i}"></div>`;
        }
      }

      // Add listeners to community slots
      commContainer.querySelectorAll('.poker-card').forEach(cardEl => {
        cardEl.addEventListener('click', () => {
          const slot = parseInt(cardEl.getAttribute('data-slot'));
          this.openCardSelector('community', null, slot);
        });
      });
    }

    // 3. Render Pot display
    const potEl = document.getElementById('felt-pot-value');
    if (potEl) {
      potEl.textContent = `$${this.game.pot + this.game.players.reduce((sum, p) => sum + p.bet, 0)}`;
    }

    // 4. Highlight action dashboard buttons
    this.updateActionDashboard();
  }

  renderCardHtml(card, playerIdx, slotIdx) {
    const rank = card[0];
    const suit = card[1];
    const suitSymbol = SUIT_SYMBOLS[suit];
    const isRed = ['h', 'd'].includes(suit);

    return `
      <div class="poker-card filled ${isRed ? 'red' : 'black'}" data-slot="${slotIdx}" ${playerIdx !== null ? `data-player="${playerIdx}"` : 'data-comm'}>
        <div>${rank}</div>
        <div style="font-size: 1.15rem; align-self: flex-end">${suitSymbol}</div>
      </div>
    `;
  }

  updateActionDashboard() {
    const activePlayer = this.game.players[this.game.activePlayerIdx];
    const checkBtn = document.getElementById('action-check');
    const callBtn = document.getElementById('action-call');
    const raiseBtn = document.getElementById('action-raise');
    const raiseSlider = document.getElementById('raise-amount-slider');
    const sliderContainer = document.querySelector('.slider-container');

    if (!activePlayer) {
      // Game showdown or paused
      document.querySelectorAll('.action-dashboard .action-btn').forEach(b => b.style.display = 'none');
      if (sliderContainer) sliderContainer.style.display = 'none';
      return;
    }

    // Unhide buttons
    document.querySelectorAll('.action-dashboard .action-btn').forEach(b => b.style.display = 'inline-block');
    if (sliderContainer) sliderContainer.style.display = 'flex';

    const lastBetSize = this.game.currentBet;
    const playerBetMatched = activePlayer.bet;

    if (lastBetSize > playerBetMatched) {
      // Facing a bet: Check is invalid, Call is valid
      if (checkBtn) checkBtn.style.display = 'none';
      if (callBtn) {
        callBtn.style.display = 'inline-block';
        callBtn.textContent = `Call $${lastBetSize - playerBetMatched}`;
      }
    } else {
      // No bet in front: Check is valid, Call is invalid
      if (checkBtn) checkBtn.style.display = 'inline-block';
      if (callBtn) callBtn.style.display = 'none';
    }

    // Setup slider raise parameters
    const minRaise = lastBetSize === 0 ? this.game.bigBlind : lastBetSize * 2;
    const maxRaise = activePlayer.chips + playerBetMatched;

    if (raiseSlider) {
      raiseSlider.min = minRaise;
      raiseSlider.max = maxRaise;
      raiseSlider.value = minRaise;
      const display = document.getElementById('raise-slider-value');
      if (display) display.textContent = `$${minRaise}`;
    }

    if (activePlayer.chips <= 0 || minRaise > maxRaise) {
      if (raiseBtn) raiseBtn.style.display = 'none';
      if (sliderContainer) sliderContainer.style.display = 'none';
    } else {
      if (raiseBtn) {
        raiseBtn.style.display = 'inline-block';
        raiseBtn.textContent = lastBetSize === 0 ? 'Bet' : 'Raise';
      }
    }
  }

  // --- Real-time GTO AI Advisor panel ---
  updateGTORecommendations() {
    const activePlayer = this.game.players[this.game.activePlayerIdx];
    const recContainer = document.getElementById('rec-action-chart');
    const commentaryEl = document.getElementById('rec-commentary-text');

    if (!activePlayer || this.game.street === 'showdown') {
      if (commentaryEl) commentaryEl.innerHTML = '<p>Hand completed. Showdown calculations executed. Click <strong>RESET HAND</strong> to play another scenario.</p>';
      if (recContainer) recContainer.innerHTML = '';
      document.getElementById('live-equity-stat').textContent = 'N/A';
      document.getElementById('live-hand-strength').textContent = 'Showdown complete';
      return;
    }

    // 1. Live Equity Monte Carlo Calculations
    const inHandPlayers = this.game.getPlayersInHand();
    const result = runMonteCarlo(inHandPlayers, this.game.communityCards, 1500);
    const activeEquity = result.find(r => r.id === activePlayer.id)?.equity || 0;

    document.getElementById('live-equity-stat').textContent = `${(activeEquity * 100).toFixed(1)}%`;

    // 2. Hand strength classification
    const handClass = classifyHandStrength(activePlayer.cards, this.game.communityCards);
    document.getElementById('live-hand-strength').textContent = `${handClass.madeClass} (${handClass.drawClass !== 'None' ? handClass.drawClass : 'No Draw'})`;

    // 3. AI recommendation weights and text commentaries
    const bundle = this.game.getGameStateBundle();
    const advice = getGTOAdvice(bundle);

    commentaryEl.innerHTML = this.parseMarkdownToHtml(advice.commentary);

    // Render weights bar chart
    if (recContainer) {
      recContainer.innerHTML = '';
      const { raise, call, check, fold } = advice.weights;

      const actionsArr = [
        { label: 'Raise', pct: raise, class: 'raise' },
        { label: this.game.currentBet > 0 ? 'Call' : 'Check', pct: this.game.currentBet > 0 ? call : check, class: this.game.currentBet > 0 ? 'call' : 'check' },
        { label: 'Fold', pct: fold, class: 'fold' }
      ];

      actionsArr.forEach(act => {
        if (act.pct > 0) {
          const item = document.createElement('div');
          item.className = 'rec-bar-item';
          item.innerHTML = `
            <div class="rec-bar-labels">
              <span>${act.label}</span>
              <span>${act.pct}%</span>
            </div>
            <div class="rec-bar-fill-container">
              <div class="rec-bar-fill ${act.class}" style="width: ${act.pct}%"></div>
            </div>
          `;
          recContainer.appendChild(item);
        }
      });
    }
  }

  parseMarkdownToHtml(md) {
    if (!md) return '';
    return md
      .replace(/^### (.*$)/gim, '<h3 style="margin-bottom: 0.75rem; color: var(--text-primary)">$1</h3>')
      .replace(/^#### (.*$)/gim, '<h4 style="margin-top: 1rem; margin-bottom: 0.4rem; color: var(--text-primary)">$1</h4>')
      .replace(/^\> (.*$)/gim, '<blockquote style="border-left: 2px solid var(--accent-green); padding-left: 0.5rem; color: var(--text-secondary); font-style: italic">$1</blockquote>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary)">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // --- Card Selector Modal Setup ---
  setupCardSelectorModal() {
    const overlay = document.getElementById('card-selector-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const randomBtn = document.getElementById('modal-btn-random');
    const clearBtn = document.getElementById('modal-btn-clear');

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeCardSelector());
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeCardSelector();
      });
    }

    if (randomBtn) {
      randomBtn.addEventListener('click', () => {
        // Pick a random available card
        const deck = this.getAvailableCardsDeck();
        if (deck.length > 0) {
          const randCard = deck[Math.floor(Math.random() * deck.length)];
          this.applyCardSelection(randCard);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.applyCardSelection(null);
      });
    }
  }

  openCardSelector(type, id, slotIdx) {
    this.activeSelectTarget = { type, id, slotIdx };

    // Enable/disable already selected cards to prevent duplicates in grid selector
    const usedCards = new Set();
    this.game.players.forEach(p => p.cards.forEach(c => c && usedCards.add(c)));
    this.game.communityCards.forEach(c => c && usedCards.add(c));

    const grid = document.getElementById('modal-cards-selection-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const suits = ['c', 'd', 'h', 's'];
    const suitLabels = ['Clubs ♣', 'Diamonds ♦', 'Hearts ♥', 'Spades ♠'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    // Render 4 suit columns
    for (let sIdx = 0; sIdx < 4; sIdx++) {
      const suit = suits[sIdx];
      const suitCol = document.createElement('div');
      suitCol.className = 'selector-suit-col';
      suitCol.innerHTML = `<div class="suit-title">${suitLabels[sIdx]}</div>`;

      // Render rank buttons within this suit
      for (let rIdx = 12; rIdx >= 0; rIdx--) {
        const rank = ranks[rIdx];
        const cardStr = rank + suit;
        const isUsed = usedCards.has(cardStr);

        const cardBtn = document.createElement('div');
        cardBtn.className = `modal-card-item ${['h', 'd'].includes(suit) ? 'red' : 'black'} ${isUsed ? 'disabled' : ''}`;
        cardBtn.textContent = rank + SUIT_SYMBOLS[suit];

        if (!isUsed) {
          cardBtn.addEventListener('click', () => {
            this.applyCardSelection(cardStr);
          });
        }

        suitCol.appendChild(cardBtn);
      }

      grid.appendChild(suitCol);
    }

    document.getElementById('card-selector-modal').classList.add('active');
  }

  closeCardSelector() {
    document.getElementById('card-selector-modal').classList.remove('active');
    this.activeSelectTarget = null;
  }

  applyCardSelection(cardStr) {
    if (!this.activeSelectTarget) return;

    const { type, id, slotIdx } = this.activeSelectTarget;

    if (type === 'player') {
      const player = this.game.players.find(p => p.id === id);
      if (player) {
        player.cards[slotIdx] = cardStr;
      }
    } else if (type === 'community') {
      this.game.communityCards[slotIdx] = cardStr;
    }

    this.renderPokerTable();
    this.updateGTORecommendations();
    this.closeCardSelector();
  }

  getAvailableCardsDeck() {
    const usedCards = new Set();
    this.game.players.forEach(p => p.cards.forEach(c => c && usedCards.add(c)));
    this.game.communityCards.forEach(c => c && usedCards.add(c));

    const available = [];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const suits = ['c', 'd', 'h', 's'];

    for (const r of ranks) {
      for (const s of suits) {
        const card = r + s;
        if (!usedCards.has(card)) {
          available.push(card);
        }
      }
    }

    return available;
  }
}
