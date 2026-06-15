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

    // Custom Preflop Drawing State
    this.paintModeActive = false;
    this.currentBrush = 'raise'; // 'raise', 'raise_mix', 'call', 'call_mix', 'fold'
    this.isPainting = false;
    this.customPreflopGrid = null; // Stored as a 13x13 strategy grid
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
          this.updateSituationButtons();
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
        
        // Reset custom grid on position change to sync with GTO, or keep it.
        // We sync custom grid with new position's GTO standard
        this.customPreflopGrid = null;
        
        this.updateSituationButtons();
        this.renderPreflopGrid();
      });
    });

    // Listeners for situation selectors
    const sitBtns = document.querySelectorAll('#preflop-situations .selector-btn');
    sitBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        sitBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSituation = btn.getAttribute('data-sit');
        
        this.customPreflopGrid = null;
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

    // Paint Mode Toggle Listener
    const paintToggle = document.getElementById('toggle-paint-mode');
    const brushesToolbar = document.getElementById('paint-brushes');
    if (paintToggle && brushesToolbar) {
      paintToggle.addEventListener('change', (e) => {
        this.paintModeActive = e.target.checked;
        if (this.paintModeActive) {
          brushesToolbar.style.display = 'flex';
          // Initialize custom grid by deep copying standard GTO grid
          this.customPreflopGrid = JSON.parse(JSON.stringify(getStrategyGrid(this.selectedPosition, this.selectedSituation)));
        } else {
          brushesToolbar.style.display = 'none';
          this.customPreflopGrid = null;
        }
        this.renderPreflopGrid();
      });
    }

    // Brush Selector Buttons
    const brushBtns = document.querySelectorAll('.brush-btn');
    brushBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        brushBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentBrush = btn.getAttribute('data-brush');
      });
    });

    // Clear Canvas Action
    const clearBtn = document.getElementById('btn-clear-canvas');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!this.paintModeActive || !this.customPreflopGrid) return;
        for (let r = 0; r < 13; r++) {
          for (let c = 0; c < 13; c++) {
            this.customPreflopGrid[r][c].weights = { raise: 0, call: 0, check: 0, fold: 100 };
          }
        }
        this.renderPreflopGrid();
      });
    }

    // Reset to GTO Action
    const resetGtoBtn = document.getElementById('btn-reset-gto');
    if (resetGtoBtn) {
      resetGtoBtn.addEventListener('click', () => {
        if (!this.paintModeActive) return;
        this.customPreflopGrid = JSON.parse(JSON.stringify(getStrategyGrid(this.selectedPosition, this.selectedSituation)));
        this.renderPreflopGrid();
      });
    }

    // GTO Analysis Modal Close Handlers
    const closeAnalysisBtn = document.getElementById('close-analysis-modal-btn');
    const btnCloseAnalysis = document.getElementById('btn-close-analysis');
    const analysisModal = document.getElementById('gto-hand-analysis-modal');

    const closeModal = () => {
      if (analysisModal) analysisModal.classList.remove('active');
    };

    if (closeAnalysisBtn) closeAnalysisBtn.addEventListener('click', closeModal);
    if (btnCloseAnalysis) btnCloseAnalysis.addEventListener('click', closeModal);

    // Global mouseup handler to stop painting
    window.addEventListener('mouseup', () => {
      this.isPainting = false;
    });

    this.updateSituationButtons();
    this.renderPreflopGrid();
  }

  /**
   * Disables invalid preflop scenario buttons based on the selected player position
   */
  updateSituationButtons() {
    const sitBtns = document.querySelectorAll('#preflop-situations .selector-btn');
    const order = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
    const pIdx = order.indexOf(this.selectedPosition);

    let activeValidBtn = null;

    sitBtns.forEach(btn => {
      const sit = btn.getAttribute('data-sit');
      let valid = false;

      if (sit === 'RFI') {
        // BB cannot open RFI
        valid = (this.selectedPosition !== 'BB');
      } else {
        // vs_X where X is a position
        const oppPos = sit.split('_')[1];
        const oppIdx = order.indexOf(oppPos);
        // Only valid if opponent acts before active player
        valid = (oppIdx !== -1 && oppIdx < pIdx);
      }

      btn.disabled = !valid;
      btn.classList.remove('active');

      if (valid && sit === this.selectedSituation) {
        btn.classList.add('active');
        activeValidBtn = btn;
      }
    });

    // If currently selected situation is invalid for this position, switch to first valid
    if (!activeValidBtn) {
      const firstValidBtn = Array.from(sitBtns).find(btn => !btn.disabled);
      if (firstValidBtn) {
        firstValidBtn.classList.add('active');
        this.selectedSituation = firstValidBtn.getAttribute('data-sit');
      }
    }
  }

  renderPreflopGrid() {
    const gridContainer = document.getElementById('starting-hand-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    // Manage painting classes on parent container
    if (this.paintModeActive) {
      gridContainer.classList.add('paint-active');
    } else {
      gridContainer.classList.remove('paint-active');
    }

    // Retrieve active grid data: either custom paint grid or standard GTO grid
    const gridData = this.paintModeActive && this.customPreflopGrid 
      ? this.customPreflopGrid 
      : getStrategyGrid(this.selectedPosition, this.selectedSituation);

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
        cellEl.setAttribute('data-row', r);
        cellEl.setAttribute('data-col', c);

        // Grid boundaries color-code helpers
        if (r === c) cellEl.classList.add('pair');
        else if (r < c) cellEl.classList.add('suited');
        else cellEl.classList.add('offsuit');

        // Mixed GTO Actions split background renderer
        const splitEl = document.createElement('div');
        splitEl.className = 'action-split';

        const { raise, call, check, fold } = cell.weights;

        // Sum aggregates
        totalHands += (raise + call + check);
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

        // Add popover tooltip for GTO frequencies (only when not in paint mode)
        if (!this.paintModeActive) {
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
        }

        // --- Event Listeners for Painting & Clicks ---
        cellEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (this.paintModeActive) {
            this.isPainting = true;
            this.paintCell(r, c);
          } else {
            // Open click detail analysis modal
            this.openAnalysisModal(cell);
          }
        });

        cellEl.addEventListener('mouseenter', () => {
          if (this.paintModeActive && this.isPainting) {
            this.paintCell(r, c);
          }
        });

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

  /**
   * Paints a single cell using the currently selected brush strategy
   */
  paintCell(r, c) {
    if (!this.customPreflopGrid) return;
    const weights = { raise: 0, call: 0, check: 0, fold: 100 };

    if (this.currentBrush === 'raise') {
      weights.raise = 100;
      weights.fold = 0;
    } else if (this.currentBrush === 'raise_mix') {
      weights.raise = 50;
      weights.fold = 50;
    } else if (this.currentBrush === 'call') {
      weights.call = 100;
      weights.fold = 0;
    } else if (this.currentBrush === 'call_mix') {
      weights.call = 50;
      weights.fold = 50;
    } else if (this.currentBrush === 'fold') {
      weights.fold = 100;
    }

    this.customPreflopGrid[r][c].weights = weights;
    this.renderPreflopGrid();
  }

  /**
   * Opens the highly educational GTO Analysis Modal for a selected hand
   */
  openAnalysisModal(cell) {
    const analysisModal = document.getElementById('gto-hand-analysis-modal');
    if (!analysisModal) return;

    // Set title
    document.getElementById('analysis-modal-title').textContent = `${cell.hand} GTO Strategy Analysis`;

    // Render visual cards
    const cardsContainer = document.getElementById('analysis-hand-cards');
    cardsContainer.innerHTML = this.getVisualCardHTML(cell.hand);

    // Render stats bar rows
    const statsContainer = document.getElementById('analysis-stats-breakdown');
    statsContainer.innerHTML = '';
    
    const actions = [
      { name: 'Raise', pct: cell.weights.raise, class: 'raise' },
      { name: 'Call', pct: cell.weights.call, class: 'call' },
      { name: 'Check', pct: cell.weights.check, class: 'check' },
      { name: 'Fold', pct: cell.weights.fold, class: 'fold' }
    ];

    actions.forEach(action => {
      if (action.pct >= 0) {
        const rowEl = document.createElement('div');
        rowEl.className = 'analysis-bar-row';
        rowEl.innerHTML = `
          <span class="analysis-bar-label">${action.name}</span>
          <div class="analysis-bar-track">
            <div class="analysis-bar-fill ${action.class}" style="width: ${action.pct}%"></div>
          </div>
          <span class="analysis-bar-value">${action.pct}%</span>
        `;
        statsContainer.appendChild(rowEl);
      }
    });

    // Generate expert tactical commentary
    const commentaryText = document.getElementById('analysis-commentary-text');
    commentaryText.textContent = this.generateGTOCommentary(cell.hand, cell.weights);

    // Show modal
    analysisModal.classList.add('active');
  }

  /**
   * Generates html card symbols
   */
  getVisualCardHTML(hand) {
    const r1 = hand[0];
    const r2 = hand[1];
    const type = hand[2] || ''; // 's', 'o', or empty (pair)

    let suit1, suit2;
    if (type === 's') {
      suit1 = '♠';
      suit2 = '♠';
    } else if (type === 'o') {
      suit1 = '♠';
      suit2 = '♥';
    } else {
      suit1 = '♠';
      suit2 = '♦';
    }

    const color1 = (suit1 === '♠' || suit1 === '♣') ? 'black-card' : 'red-card';
    const color2 = (suit2 === '♠' || suit2 === '♣') ? 'black-card' : 'red-card';

    return `
      <div class="analysis-card-slot ${color1}">
        <span style="font-size: 1.4rem; font-weight: 800;">${r1}</span>
        <span class="analysis-card-suit">${suit1}</span>
      </div>
      <div class="analysis-card-slot ${color2}">
        <span style="font-size: 1.4rem; font-weight: 800;">${r2}</span>
        <span class="analysis-card-suit">${suit2}</span>
      </div>
    `;
  }

  /**
   * Generates custom GTO strategic rationale commentary
   */
  generateGTOCommentary(hand, weights) {
    const r1 = hand[0];
    const r2 = hand[1];
    const isPair = (r1 === r2);
    const isSuited = hand.endsWith('s');

    if (weights.fold === 100) {
      return `弃牌 (Fold 100%)。${hand} 在当前位置和战术场景下无法实现正的期望值 (EV)。在 GTO 理论中，这是标准的长线防守弃牌，继续跟注或加注只会导致长期的筹码亏损。`;
    }

    if (weights.raise === 100) {
      if (isPair && ['A', 'K', 'Q', 'J'].includes(r1)) {
        return `纯加注 (Raise 100%)。${hand} 是顶级超强口袋对子，拥有统治级的胜率优势。GTO 强烈要求 100% 进行加注（开池或 3-Bet/4-Bet）以最大化提取价值并保护你的手牌权益。`;
      }
      if (hand === 'AKs' || hand === 'AKo') {
        return `纯加注 (Raise 100%)。AK 是顶级的强牌，具有极佳的阻挡牌效应（阻挡了对手的 AA/KK）。在任何位置，GTO 都会进行高频进攻，压制对手的防守范围。`;
      }
      return `纯加注 (Raise 100%)。手牌 ${hand} 具有非常优秀的牌力或阻挡效应。GTO 选择通过 100% 的加注频率主导池底，给后面的选手施加最大压力。`;
    }

    if (weights.call === 100) {
      return `纯跟注 (Call 100%)。${hand} 是一手强牌，拥有极高的跟注期望值 (EV)，但还不足以进行价值 3-Bet。平跟可以实现很好的底池控制，并在翻后利用位置和高玩牌性压制对手。`;
    }

    // Mixed strategies
    if (weights.raise > 0 && weights.fold > 0) {
      if (isSuited && ['A', 'K'].includes(r1) && !['Q', 'J'].includes(r2)) {
        return `混合策略 (Raise ${weights.raise}% / Fold ${weights.fold}%)。同花 A 弱高张（如 A5s-A2s）是 GTO 中经典的“3-Bet 诈唬候选牌”。它们阻挡了对手的 AA/AK，且翻后极具同花、顺子和两对潜力。混合频率可以完美平衡我们的范围。`;
      }
      return `混合加注策略 (Raise ${weights.raise}% / Fold ${weights.fold}%)。该手牌处于可玩与不可玩的边缘。GTO 使用混合频率进行开池或 3-Bet，能有效迷惑对手，并让我们的策略达到纳什均衡状态，不可被剥削。`;
    }

    if (weights.call > 0 && weights.fold > 0) {
      return `混合防守策略 (Call ${weights.call}% / Fold ${weights.fold}%)。${hand} 在这个对抗局面下期望值极近边缘。根据 GTO，以一部分概率进行防守平跟，另一部分概率弃牌，能使我们的防守频率保持平衡，不给加注者留出剥削漏洞。`;
    }

    if (weights.raise > 0 && weights.call > 0) {
      return `混合强牌对抗 (Raise ${weights.raise}% / Call ${weights.call}%)。手牌 ${hand} 实力极强。GTO 通过分配一部分概率加注（进行高频挤压）、一部分概率跟注（隐藏实力），来形成极富伪装性的范围分布。`;
    }

    return `GTO 策略混合点。利用精确的概率配比进行多元化行动，这是对抗高水平玩家的底气所在。严格执行策略频率可确保你在扑克长线决策中稳立于不败之地。`;
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
