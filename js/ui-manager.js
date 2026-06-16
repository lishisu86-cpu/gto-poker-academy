/* --- UI Manager: Grid Renderers, Table Graphics, and Modal Handlers --- */

import { coordsToHand, getStrategyGrid } from './gto-preflop.js?v=20260616a';
import { runMonteCarlo, SUIT_SYMBOLS } from './evaluator.js?v=20260616a';
import { getGTOAdvice, classifyHandStrength, analyzeBoardTexture } from './gto-postflop.js?v=20260616a';
import { AudioManager } from './audio-manager.js?v=20260616a';

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

    // --- Premium Dual Mode & GTO Peeking Additions ---
    this.gameMode = 'play'; // 'play' (real play training) vs 'edit' (sandbox config edit)
    this.manuallyRevealedPlayers = new Set(); // bot IDs manually clicked to reveal face-up
    this.coachUnlocked = false; // whether GTO advice blur is dissolved for current Hero turn

    // --- Sound Synthesis Engine ---
    this.audio = new AudioManager();
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
    this.isBotThinking = false;

    // Mode switching buttons
    const playModeBtn = document.getElementById('btn-mode-play');
    const editModeBtn = document.getElementById('btn-mode-edit');

    if (playModeBtn && editModeBtn) {
      playModeBtn.addEventListener('click', () => {
        if (this.gameMode === 'play') return;
        this.gameMode = 'play';
        playModeBtn.classList.add('active');
        editModeBtn.classList.remove('active');
        
        // Reset and deal clean cards under Play Mode
        this.manuallyRevealedPlayers.clear();
        this.coachUnlocked = false;
        this.initiateHandAndLog();
        this.addLogEntry('--- Switched to Play Mode: Opponents are face-down. Click on any seat to peak! ---', 'system');
      });

      editModeBtn.addEventListener('click', () => {
        if (this.gameMode === 'edit') return;
        this.gameMode = 'edit';
        editModeBtn.classList.add('active');
        playModeBtn.classList.remove('active');
        
        // Retain existing state but allow card customizations
        this.renderPokerTable();
        this.updateGTORecommendations();
        this.addLogEntry('--- Switched to Sandbox Edit Mode: Click on any card slot to manually customize! ---', 'system');
      });
    }

    this.initiateHandAndLog();

    // Reset hand
    const resetBtn = document.getElementById('btn-reset-hand');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.initiateHandAndLog();
      });
    }

    // Next Card / Auto-advance street
    const nextBtn = document.getElementById('btn-next-street');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const oldStreet = this.game.street;
        this.game.advanceStreet();
        this.checkStateChangesAndLog(oldStreet, -1);
        this.renderPokerTable();
        this.updateGTORecommendations();
      });
    }

    // Setup action buttons click events
    const actBtns = document.querySelectorAll('.action-dashboard .action-btn:not(.reset-btn)');
    actBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isBotThinking) return;

        const act = btn.getAttribute('data-action');
        if (!act) return;

        let amount = 0;
        if (act === 'raise') {
          const slider = document.getElementById('raise-amount-slider');
          amount = parseInt(slider?.value || 0);
        } else if (act === 'allin') {
          const activePlayer = this.game.players[this.game.activePlayerIdx];
          amount = activePlayer.chips + activePlayer.bet;
        }

        const activePlayer = this.game.players[this.game.activePlayerIdx];
        const lastBetSize = this.game.currentBet;
        const playerBetMatched = activePlayer.bet;

        // Log Hero action
        let logMessage = '';
        if (act === 'fold') {
          logMessage = `Hero folds.`;
        } else if (act === 'check') {
          logMessage = `Hero checks.`;
        } else if (act === 'call') {
          const callDiff = lastBetSize - playerBetMatched;
          const actualCall = Math.min(callDiff, activePlayer.chips);
          logMessage = `Hero calls $${actualCall}.`;
        } else if (act === 'raise') {
          if (lastBetSize === 0) {
            logMessage = `Hero bets $${amount}.`;
          } else {
            logMessage = `Hero raises to $${amount}.`;
          }
        } else if (act === 'allin') {
          logMessage = `Hero goes All-In for $${amount}! 💥`;
        }
        
        // Play action sound
        if (act === 'fold' || act === 'check') {
          this.audio.playFold();
        } else if (act === 'call' || act === 'raise' || act === 'allin') {
          this.audio.playChip();
        }

        this.addLogEntry(logMessage, act);

        const oldStreet = this.game.street;
        const oldActiveIdx = this.game.activePlayerIdx;

        const engineAction = (act === 'allin') ? 'raise' : act;
        this.game.processAction(engineAction, amount);

        this.checkStateChangesAndLog(oldStreet, oldActiveIdx);
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
        this.updateRaiseButtonText();
      });
    }

    // Setup Bet Preset Click Handlers
    const presetBtns = document.querySelectorAll('#bet-presets-row .preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isBotThinking) return;

        const preset = btn.getAttribute('data-preset');
        if (!preset) return;

        const activePlayer = this.game.players[this.game.activePlayerIdx];
        if (!activePlayer) return;

        const lastBetSize = this.game.currentBet;
        const playerBetMatched = activePlayer.bet;
        const minRaise = lastBetSize === 0 ? this.game.bigBlind : lastBetSize * 2;
        const maxRaise = activePlayer.chips + playerBetMatched;
        const totalPot = this.game.pot + this.game.players.reduce((sum, p) => sum + p.bet, 0);

        let targetAmt = minRaise;
        if (preset === 'min') {
          targetAmt = minRaise;
        } else if (preset === '1/3') {
          if (lastBetSize === 0) {
            targetAmt = Math.floor(totalPot / 3);
          } else {
            const callAmt = lastBetSize - playerBetMatched;
            targetAmt = Math.floor(lastBetSize + (totalPot + callAmt) / 3);
          }
        } else if (preset === '1/2') {
          if (lastBetSize === 0) {
            targetAmt = Math.floor(totalPot / 2);
          } else {
            const callAmt = lastBetSize - playerBetMatched;
            targetAmt = Math.floor(lastBetSize + (totalPot + callAmt) / 2);
          }
        } else if (preset === '2/3') {
          if (lastBetSize === 0) {
            targetAmt = Math.floor((totalPot * 2) / 3);
          } else {
            const callAmt = lastBetSize - playerBetMatched;
            targetAmt = Math.floor(lastBetSize + ((totalPot + callAmt) * 2) / 3);
          }
        } else if (preset === 'pot') {
          if (lastBetSize === 0) {
            targetAmt = totalPot;
          } else {
            const callAmt = lastBetSize - playerBetMatched;
            targetAmt = Math.floor(lastBetSize + (totalPot + callAmt));
          }
        } else if (preset === 'allin') {
          targetAmt = maxRaise;
        }

        // Clamp bet/raise size to valid ranges
        targetAmt = Math.max(minRaise, Math.min(maxRaise, targetAmt));

        // Update Slider and Text display
        if (raiseSlider) {
          raiseSlider.value = targetAmt;
        }
        if (raiseValDisplay) {
          raiseValDisplay.textContent = `$${targetAmt}`;
        }

        // Sync Raise/Bet button text
        this.updateRaiseButtonText();
      });
    });

    // God Mode Toggle
    const revealCardsToggle = document.getElementById('toggle-reveal-opponent-cards');
    if (revealCardsToggle) {
      revealCardsToggle.addEventListener('change', () => {
        this.renderPokerTable();
      });
    }

    // GTO Coach Toggle
    const coachToggle = document.getElementById('toggle-gto-coach');
    if (coachToggle) {
      coachToggle.addEventListener('change', () => {
        this.updateGTORecommendations();
      });
    }

    // Game Sound Toggle
    const soundToggle = document.getElementById('toggle-game-sound');
    if (soundToggle) {
      this.audio.setMuted(!soundToggle.checked);
      soundToggle.addEventListener('change', (e) => {
        this.audio.setMuted(!e.target.checked);
        if (e.target.checked) {
          this.audio.playChip();
        }
      });
    }
  }

  initiateHandAndLog() {
    this.isBotThinking = false;
    this.manuallyRevealedPlayers.clear();
    this.coachUnlocked = false;
    this.isStreetDealt = true;
    
    // Clear log box or append starting logs
    const logBox = document.getElementById('game-log-box');
    if (logBox) logBox.innerHTML = '';
    
    const success = this.game.startNewHand();
    if (!success) {
      this.addLogEntry('Not enough active players to start a hand!', 'error');
      return;
    }

    this.audio.playCardDeal();
    this.addLogEntry('--- New Hand Started ---', 'system');
    
    // Log Blinds
    const sbPlayer = this.game.players.find(p => p.isSB);
    const bbPlayer = this.game.players.find(p => p.isBB);
    if (sbPlayer) {
      this.addLogEntry(`${sbPlayer.name} posts Small Blind of $${sbPlayer.bet}.`, 'system');
    }
    if (bbPlayer) {
      this.addLogEntry(`${bbPlayer.name} posts Big Blind of $${bbPlayer.bet}.`, 'system');
    }
    
    this.renderPokerTable();
    this.updateGTORecommendations();
  }

  addLogEntry(message, type = 'system') {
    const logBox = document.getElementById('game-log-box');
    if (!logBox) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
  }

  checkStateChangesAndLog(oldStreet, oldActivePlayerIdx) {
    const currentStreet = this.game.street;
    
    // 1. Check if street transitioned
    if (currentStreet !== oldStreet) {
      this.isStreetDealt = true;

      // Log runout intermediate streets if we went straight to showdown from a previous street
      if (currentStreet === 'showdown') {
        if (oldStreet === 'preflop') {
          const flopCards = this.game.communityCards.slice(0, 3).join(' ');
          const turnCard = this.game.communityCards[3];
          const riverCard = this.game.communityCards[4];
          this.addLogEntry(`--- Runout Flop: [${flopCards}] ---`, 'street');
          this.addLogEntry(`--- Runout Turn: [${turnCard}] ---`, 'street');
          this.addLogEntry(`--- Runout River: [${riverCard}] ---`, 'street');
        } else if (oldStreet === 'flop') {
          const turnCard = this.game.communityCards[3];
          const riverCard = this.game.communityCards[4];
          this.addLogEntry(`--- Runout Turn: [${turnCard}] ---`, 'street');
          this.addLogEntry(`--- Runout River: [${riverCard}] ---`, 'street');
        } else if (oldStreet === 'turn') {
          const riverCard = this.game.communityCards[4];
          this.addLogEntry(`--- Runout River: [${riverCard}] ---`, 'street');
        }
        
        this.addLogEntry(`--- Showdown ---`, 'street');
        this.logShowdownResults();
      } else {
        if (currentStreet === 'flop') {
          const cards = this.game.communityCards.join(' ');
          this.addLogEntry(`--- Flop Dealt: [${cards}] ---`, 'street');
          this.audio.playCardDeal();
        } else if (currentStreet === 'turn') {
          const cards = this.game.communityCards.join(' ');
          this.addLogEntry(`--- Turn Dealt: [${cards}] ---`, 'street');
          this.audio.playCardDeal();
        } else if (currentStreet === 'river') {
          const cards = this.game.communityCards.join(' ');
          this.addLogEntry(`--- River Dealt: [${cards}] ---`, 'street');
          this.audio.playCardDeal();
        }
      }
    }

    // 2. Check if turn transitioned back to Hero
    if (oldActivePlayerIdx !== 0 && this.game.activePlayerIdx === 0) {
      this.coachUnlocked = false;
    }
  }

  logShowdownResults() {
    const inHand = this.game.players.filter(p => p.isActive && !p.hasFolded);
    if (inHand.length === 0) return;

    // Check if only 1 player won because everyone else folded
    if (inHand.length === 1) {
      this.addLogEntry(`🏆 ${inHand[0].name} wins the pot (Everyone else folded).`, 'system');
      this.audio.playWin();
      return;
    }

    let bestScore = -1;
    let winners = [];
    const evaluations = [];

    inHand.forEach(p => {
      const seven = [...p.cards, ...this.game.communityCards];
      const ev = evaluate7(seven);
      const score = ev?.score || 0;
      evaluations.push({ player: p, score, ev });
      
      if (score > bestScore) {
        bestScore = score;
        winners = [p];
      } else if (score === bestScore) {
        winners.push(p);
      }
    });

    // Log what each player holds
    evaluations.forEach(item => {
      const cardsStr = item.player.cards.join(' ');
      const handName = item.ev?.categoryName || 'High Card';
      this.addLogEntry(`${item.player.name} shows [${cardsStr}] (${handName}).`, 'showdown');
    });

    // Log the winner(s)
    const winnerNames = winners.map(w => w.name).join(' & ');
    this.addLogEntry(`🏆 ${winnerNames} wins the pot!`, 'system');
    this.audio.playWin();
  }

  scheduleBotTurn() {
    this.isBotThinking = true;
    
    // 1. Deactivate action buttons and show that bots are thinking
    this.updateActionDashboard();
    
    // 2. Re-render the table so that the active seat gets the 'thinking' class
    const activePlayer = this.game.players[this.game.activePlayerIdx];
    const seatDiv = document.querySelector(`.player-seat[data-seat="${activePlayer.id}"]`);
    if (seatDiv) {
      seatDiv.classList.add('thinking');
    }

    // 3. Wait for 800ms to simulate bot thinking
    setTimeout(() => {
      this.executeBotTurn();
    }, 800);
  }

  executeBotTurn() {
    // If the active player changed or game ended while waiting, abort
    if (this.game.activePlayerIdx === -1 || this.game.activePlayerIdx === 0 || this.game.street === 'showdown') {
      this.isBotThinking = false;
      this.renderPokerTable();
      this.updateGTORecommendations();
      return;
    }

    const activePlayer = this.game.players[this.game.activePlayerIdx];
    
    // 1. Get GTO advice for the bot's current state
    const bundle = this.game.getGameStateBundle();
    const advice = getGTOAdvice(bundle);
    const weights = advice.weights;

    // 2. Roll a GTO probabilistic decision
    const rand = Math.random() * 100;
    let actionChosen = 'fold';

    if (rand < weights.raise) {
      actionChosen = 'raise';
    } else if (rand < weights.raise + weights.call) {
      actionChosen = 'call';
    } else if (rand < weights.raise + weights.call + weights.check) {
      actionChosen = 'check';
    } else {
      actionChosen = 'fold';
    }

    // Normalize check/call depending on facing bets
    const lastBetSize = this.game.currentBet;
    const playerBetMatched = activePlayer.bet;

    if (actionChosen === 'check' && lastBetSize > playerBetMatched) {
      actionChosen = 'call';
    }
    if (actionChosen === 'call' && lastBetSize === playerBetMatched) {
      actionChosen = 'check';
    }

    // Determine target raise/bet amount if action is raise
    let amount = 0;
    if (actionChosen === 'raise') {
      const minRaise = lastBetSize === 0 ? this.game.bigBlind : lastBetSize * 2;
      const maxRaise = activePlayer.chips + playerBetMatched;
      const totalPot = this.game.pot + this.game.players.reduce((sum, p) => sum + p.bet, 0);

      amount = lastBetSize === 0 
        ? Math.floor(totalPot / 2) 
        : lastBetSize * 3;
      amount = Math.max(minRaise, Math.min(maxRaise, amount));
    }

    // 3. Log the action
    let logMessage = '';
    const posLabel = activePlayer.position ? ` (${activePlayer.position})` : '';
    if (actionChosen === 'fold') {
      logMessage = `${activePlayer.name}${posLabel} folds.`;
    } else if (actionChosen === 'check') {
      logMessage = `${activePlayer.name}${posLabel} checks.`;
    } else if (actionChosen === 'call') {
      const callDiff = lastBetSize - playerBetMatched;
      const actualCall = Math.min(callDiff, activePlayer.chips);
      logMessage = `${activePlayer.name}${posLabel} calls $${actualCall}.`;
    } else if (actionChosen === 'raise') {
      if (lastBetSize === 0) {
        logMessage = `${activePlayer.name}${posLabel} bets $${amount}.`;
      } else {
        logMessage = `${activePlayer.name}${posLabel} raises to $${amount}.`;
      }
    }

    // Play action sound
    if (actionChosen === 'fold' || actionChosen === 'check') {
      this.audio.playFold();
    } else if (actionChosen === 'call' || actionChosen === 'raise') {
      this.audio.playChip();
    }

    this.addLogEntry(logMessage, actionChosen);

    // 4. Process the action in the game engine
    const oldStreet = this.game.street;
    const oldActiveIdx = this.game.activePlayerIdx;

    this.game.processAction(actionChosen, amount);
    
    this.checkStateChangesAndLog(oldStreet, oldActiveIdx);

    this.isBotThinking = false;

    // 5. Render and continue loops
    this.renderPokerTable();
    this.updateGTORecommendations();
  }

  updateRaiseButtonText() {
    const raiseSlider = document.getElementById('raise-amount-slider');
    const raiseBtn = document.getElementById('action-raise');
    const multLabel = document.getElementById('slider-multiplier-label');
    const potDesc = document.getElementById('slider-pot-desc');

    if (raiseSlider && raiseBtn) {
      const value = parseInt(raiseSlider.value);
      const lastBetSize = this.game.currentBet;
      const activePlayer = this.game.players[this.game.activePlayerIdx];
      const playerBetMatched = activePlayer ? activePlayer.bet : 0;
      const callAmt = Math.max(0, lastBetSize - playerBetMatched);
      const totalPot = this.game.pot + this.game.players.reduce((sum, p) => sum + p.bet, 0);

      if (lastBetSize === 0) {
        raiseBtn.textContent = `Bet $${value}`;
        if (totalPot > 0) {
          const mult = (value / totalPot).toFixed(2);
          if (multLabel) multLabel.textContent = `Bet Size: ${mult}x Pot`;
        } else {
          const bbMult = (value / this.game.bigBlind).toFixed(1);
          if (multLabel) multLabel.textContent = `Bet Size: ${bbMult}x BB`;
        }
      } else {
        raiseBtn.textContent = `Raise to $${value} (+$${callAmt} Call)`;
        const raiseAmt = value - lastBetSize;
        const potAfterCall = totalPot + callAmt;
        if (potAfterCall > 0) {
          const mult = (raiseAmt / potAfterCall).toFixed(2);
          if (multLabel) multLabel.textContent = `Raise Size: ${mult}x Pot`;
        } else {
          if (multLabel) multLabel.textContent = `Raise`;
        }
      }

      if (potDesc) {
        potDesc.textContent = `Current Pot: $${totalPot}`;
      }
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
      // Determine if this seat should show thinking overlay
      const isBotAndThinking = (this.game.activePlayerIdx === p.id && p.id !== 0 && this.isBotThinking);
      
      const seatDiv = document.createElement('div');
      seatDiv.className = `player-seat ${!p.isActive ? 'empty' : ''} ${this.game.activePlayerIdx === p.id ? 'active' : ''} ${isBotAndThinking ? 'thinking' : ''}`;
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
        let card1Html = `<div class="poker-card-wrapper empty-slot" data-slot="0"></div>`;
        let card2Html = `<div class="poker-card-wrapper empty-slot" data-slot="1"></div>`;

        const revealToggle = document.getElementById('toggle-reveal-opponent-cards');
        const revealEnabled = revealToggle ? revealToggle.checked : false;
        
        // Face down condition: is bot AND God Mode is off AND hasn't been manually peeking-revealed
        const isManuallyRevealed = this.manuallyRevealedPlayers.has(p.id);
        const isFaceDown = p.id !== 0 && this.game.street !== 'showdown' && !revealEnabled && !isManuallyRevealed;

        // Use staggered delay indices only on fresh street/hand dealing triggers
        const staggerIdx = this.isStreetDealt ? p.id : null;

        if (p.cards[0]) {
          card1Html = this.renderCardHtml(p.cards[0], p.id, 0, isFaceDown, staggerIdx);
        }
        if (p.cards[1]) {
          card2Html = this.renderCardHtml(p.cards[1], p.id, 1, isFaceDown, staggerIdx);
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

        // Handle seat card interactions based on current Active Mode
        const seatCardEl = seatDiv.querySelector('.seat-card');
        if (seatCardEl) {
          seatCardEl.addEventListener('click', () => {
            if (this.gameMode === 'play' && p.id > 0) {
              if (this.manuallyRevealedPlayers.has(p.id)) {
                this.manuallyRevealedPlayers.delete(p.id);
                this.addLogEntry(`Flipped opponent ${p.name}'s cards face-down.`, 'bot');
              } else {
                this.manuallyRevealedPlayers.add(p.id);
                this.addLogEntry(`Flipped opponent ${p.name}'s cards face-up: [${p.cards.join(' ')}].`, 'gto');
              }
              this.renderPokerTable();
              this.updateGTORecommendations();
            }
          });
        }

        seatDiv.querySelectorAll('.poker-card-wrapper').forEach(cardEl => {
          cardEl.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent seat card bubble triggers
            const slot = parseInt(cardEl.getAttribute('data-slot'));
            
            if (this.gameMode === 'edit') {
              this.openCardSelector('player', p.id, slot);
            } else {
              // Trigger same flip peeking logic as seat card clicking in Play Mode
              if (p.id > 0) {
                if (this.manuallyRevealedPlayers.has(p.id)) {
                  this.manuallyRevealedPlayers.delete(p.id);
                  this.addLogEntry(`Flipped opponent ${p.name}'s cards face-down.`, 'bot');
                } else {
                  this.manuallyRevealedPlayers.add(p.id);
                  this.addLogEntry(`Flipped opponent ${p.name}'s cards face-up: [${p.cards.join(' ')}].`, 'gto');
                }
                this.renderPokerTable();
                this.updateGTORecommendations();
              } else {
                this.addLogEntry('These are your hole cards! Try to play optimal GTO strategies using your own brain.', 'hero');
              }
            }
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
        seatDiv.appendChild(dealerBtn);
      }

      // Render Current bet chips indicator
      if (p.isActive && p.bet > 0) {
        const betDiv = document.createElement('div');
        
        let colorClass = 'chip-red';
        if (p.bet >= 500) {
          colorClass = 'chip-black';
        } else if (p.bet >= 100) {
          colorClass = 'chip-blue';
        }

        betDiv.className = `bet-chips chip-deal-anim ${colorClass}`;
        betDiv.setAttribute('data-seat-bet', p.id);
        betDiv.innerHTML = `
          $${p.bet}
        `;
        seatDiv.appendChild(betDiv);
      }
    });

    // 2. Render Community Cards
    const commContainer = document.getElementById('community-cards-row');
    if (commContainer) {
      commContainer.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const cCard = this.game.communityCards[i];
        if (cCard) {
          const staggerIdx = this.isStreetDealt ? i : null;
          commContainer.innerHTML += this.renderCardHtml(cCard, null, i, false, staggerIdx);
        } else {
          commContainer.innerHTML += `<div class="poker-card-wrapper empty-slot" data-slot="${i}"></div>`;
        }
      }

      // Add listeners to community slots
      commContainer.querySelectorAll('.poker-card-wrapper').forEach(cardEl => {
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

    // 5. Trigger Bot Autoplay if applicable
    if (this.game.activePlayerIdx !== -1 && this.game.activePlayerIdx !== 0 && this.game.street !== 'showdown') {
      if (!this.isBotThinking) {
        this.scheduleBotTurn();
      }
    }

    // Reset street deal trigger at the very end of the loop
    this.isStreetDealt = false;
  }

  renderCardHtml(card, playerIdx, slotIdx, isFaceDown = false, staggerIdx = null) {
    const rank = card[0];
    const suit = card[1];
    const suitSymbol = SUIT_SYMBOLS[suit];
    const isRed = ['h', 'd'].includes(suit);
    const animClass = staggerIdx !== null ? `deal-anim delay-${staggerIdx}` : '';

    return `
      <div class="poker-card-wrapper ${isFaceDown ? 'face-down' : ''} filled ${animClass}" data-slot="${slotIdx}" ${playerIdx !== null ? `data-player="${playerIdx}"` : 'data-comm'}>
        <div class="poker-card-inner">
          <div class="card-front ${isRed ? 'red' : 'black'}">
            <span class="card-rank">${rank}</span>
            <span class="card-suit">${suitSymbol}</span>
          </div>
          <div class="card-back"></div>
        </div>
      </div>
    `;
  }

  updateActionDashboard() {
    const activePlayer = this.game.players[this.game.activePlayerIdx];
    const checkBtn = document.getElementById('action-check');
    const callBtn = document.getElementById('action-call');
    const raiseBtn = document.getElementById('action-raise');
    const allinBtn = document.getElementById('action-allin');
    const raiseSlider = document.getElementById('raise-amount-slider');
    const sliderContainer = document.querySelector('.slider-container');

    const resetHandBtn = document.getElementById('btn-reset-hand');
    const nextStreetBtn = document.getElementById('btn-next-street');

    // Reset hand button should always be visible and active at any time
    if (resetHandBtn) {
      resetHandBtn.style.display = 'inline-block';
      resetHandBtn.disabled = false;
      resetHandBtn.style.opacity = '1';
      resetHandBtn.style.pointerEvents = 'auto';
    }
    // Deal street button is Sandbox Mode only
    if (nextStreetBtn) {
      if (this.gameMode === 'edit') {
        nextStreetBtn.style.display = 'inline-block';
        nextStreetBtn.disabled = false;
        nextStreetBtn.style.opacity = '1';
        nextStreetBtn.style.pointerEvents = 'auto';
      } else {
        nextStreetBtn.style.display = 'none';
      }
    }

    // Determine if user controls should be completely disabled (because it's a bot's turn or bot is thinking)
    const isBotTurn = (this.game.activePlayerIdx !== -1 && this.game.activePlayerIdx !== 0);
    const disableControls = isBotTurn || this.isBotThinking;

    if (!activePlayer || this.game.street === 'showdown') {
      // Game showdown or paused
      document.querySelectorAll('.action-dashboard .action-btn:not(.reset-btn)').forEach(b => b.style.display = 'none');
      if (sliderContainer) sliderContainer.style.display = 'none';
      return;
    }

    // Unhide play action buttons
    document.querySelectorAll('.action-dashboard .action-btn:not(.reset-btn)').forEach(b => {
      b.style.display = 'inline-block';
      b.disabled = disableControls;
      b.style.opacity = disableControls ? '0.4' : '1';
      b.style.pointerEvents = disableControls ? 'none' : 'auto';
    });
    
    if (sliderContainer) {
      sliderContainer.style.display = 'flex';
      sliderContainer.style.opacity = disableControls ? '0.4' : '1';
      sliderContainer.style.pointerEvents = disableControls ? 'none' : 'auto';
    }

    if (raiseSlider) {
      raiseSlider.disabled = disableControls;
    }

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
      // Only reset the slider value if it is out of bounds
      const curVal = parseInt(raiseSlider.value);
      if (curVal < minRaise || curVal > maxRaise) {
        raiseSlider.value = minRaise;
      }
      const display = document.getElementById('raise-slider-value');
      if (display) display.textContent = `$${raiseSlider.value}`;
    }

    if (activePlayer.chips <= 0 || minRaise > maxRaise) {
      if (raiseBtn) raiseBtn.style.display = 'none';
      if (sliderContainer) sliderContainer.style.display = 'none';
    } else {
      if (raiseBtn) {
        raiseBtn.style.display = 'inline-block';
        this.updateRaiseButtonText();
      }
    }

    if (allinBtn) {
      if (activePlayer.chips <= 0) {
        allinBtn.style.display = 'none';
      } else {
        allinBtn.style.display = 'inline-block';
        allinBtn.textContent = `All-In ($${activePlayer.chips})`;
      }
    }
  }

  updateGTORecommendations() {
    const activePlayer = this.game.players[this.game.activePlayerIdx];
    const recContainer = document.getElementById('rec-action-chart');
    const commentaryEl = document.getElementById('rec-commentary-text');

    const coachToggle = document.getElementById('toggle-gto-coach');
    const gtoWrapper = document.getElementById('gto-advisor-wrapper');
    const gtoPanel = document.getElementById('gto-advisor-panel');
    const isCoachEnabled = coachToggle ? coachToggle.checked : true;

    // 1. Remove existing locked glass overlays & blur mask
    const existingOverlay = gtoWrapper ? gtoWrapper.querySelector('.advisor-lock-overlay') : null;
    if (existingOverlay) {
      existingOverlay.remove();
    }
    if (gtoPanel) {
      gtoPanel.classList.remove('gto-blur-mask');
    }

    if (!activePlayer || this.game.street === 'showdown') {
      if (commentaryEl) commentaryEl.innerHTML = '<p>Hand completed. Showdown calculations executed. Click <strong>RESET HAND</strong> to play another scenario.</p>';
      if (recContainer) recContainer.innerHTML = '';
      document.getElementById('live-equity-stat').textContent = 'N/A';
      document.getElementById('live-hand-strength').textContent = 'Showdown complete';
      return;
    }

    // 2. Live Equity Monte Carlo Calculations
    const inHandPlayers = this.game.getPlayersInHand();
    const result = runMonteCarlo(inHandPlayers, this.game.communityCards, 1500);
    const activeEquity = result.find(r => r.id === activePlayer.id)?.equity || 0;

    document.getElementById('live-equity-stat').textContent = `${(activeEquity * 100).toFixed(1)}%`;

    // 3. Hand strength classification
    const handClass = classifyHandStrength(activePlayer.cards, this.game.communityCards);
    document.getElementById('live-hand-strength').textContent = `${handClass.madeClass} (${handClass.drawClass !== 'None' ? handClass.drawClass : 'No Draw'})`;

    // 4. AI recommendation weights and text commentaries
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

    // 5. Apply Glassmorphic Lock if Hero's turn, coach is enabled, and coach is NOT unlocked
    if (this.game.activePlayerIdx === 0 && isCoachEnabled && !this.coachUnlocked) {
      if (gtoWrapper && gtoPanel) {
        gtoPanel.classList.add('gto-blur-mask');

        const overlay = document.createElement('div');
        overlay.className = 'advisor-lock-overlay';
        overlay.innerHTML = `
          <div class="lock-icon">🔒</div>
          <h4>GTO Coach Locked</h4>
          <p>Trust your instincts! Try to play optimal preflop/postflop strategies with your own brain. When you're ready to learn, unlock the advisor.</p>
          <button class="unlock-btn" id="btn-unlock-gto">Unlock GTO Advice</button>
        `;

        gtoWrapper.appendChild(overlay);

        const unlockBtn = overlay.querySelector('#btn-unlock-gto');
        if (unlockBtn) {
          unlockBtn.addEventListener('click', () => {
            this.coachUnlocked = true;
            overlay.style.animation = 'fadeOut 0.3s ease forwards';
            gtoPanel.style.filter = 'blur(0px)';
            setTimeout(() => {
              this.updateGTORecommendations();
            }, 300);
          });
        }
      }
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
