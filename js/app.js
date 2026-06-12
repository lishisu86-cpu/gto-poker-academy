/* --- Main Application Bootstrap & Coordination --- */

import { PokerGame } from './poker-game.js';
import { UIManager } from './ui-manager.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Instantiate Core Poker State Engine
  const game = new PokerGame();

  // 2. Instantiate and Link UI Controller
  const ui = new UIManager(game);

  // 3. Setup global configure controls on page header
  setupGlobalControls(game, ui);

  // 4. Bootstrap UIManager
  ui.init();

  // 5. Conduct first-time advisory calculation
  ui.updateGTORecommendations();
});

/**
 * Attaches handlers for seat setup, player count changes, and custom blind structures.
 */
function setupGlobalControls(game, ui) {
  const seatsCountInput = document.getElementById('config-seats-count');
  const sbInput = document.getElementById('config-sb-value');
  const bbInput = document.getElementById('config-bb-value');
  const applyConfigBtn = document.getElementById('btn-apply-config');

  if (applyConfigBtn) {
    applyConfigBtn.addEventListener('click', () => {
      // Parse settings
      const seatsCount = parseInt(seatsCountInput?.value || '9');
      const sbVal = parseInt(sbInput?.value || '10');
      const bbVal = parseInt(bbInput?.value || '20');

      // Update Game values
      game.smallBlind = sbVal;
      game.bigBlind = bbVal;

      // Adjust player count
      for (let i = 0; i < 9; i++) {
        game.players[i].isActive = i < seatsCount;
      }

      // Re-initialize a clean hand under new parameters
      game.startNewHand();
      ui.renderPokerTable();
      ui.updateGTORecommendations();

      // Close configure settings menu if inside a dropdown
      const configPanel = document.getElementById('setup-config-panel');
      if (configPanel) configPanel.style.display = 'none';
    });
  }

  // Config panel toggler
  const configToggle = document.getElementById('toggle-config-btn');
  const configPanel = document.getElementById('setup-config-panel');
  if (configToggle && configPanel) {
    configToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = configPanel.style.display;
      configPanel.style.display = current === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      if (!configPanel.contains(e.target) && e.target !== configToggle) {
        configPanel.style.display = 'none';
      }
    });
  }
}
