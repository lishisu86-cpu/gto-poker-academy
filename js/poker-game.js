/* --- Texas Hold'em Game Engine & 9-Max State Machine --- */

import { evaluate7, RANK_CHARS, SUIT_CHARS } from './evaluator.js?v=20260616a';

export const ST_PREFLOP = 'preflop';
export const ST_FLOP = 'flop';
export const ST_TURN = 'turn';
export const ST_RIVER = 'river';
export const ST_SHOWDOWN = 'showdown';

export class PokerGame {
  constructor() {
    this.numSeats = 9;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.startingChips = 2000; // 100 BB

    this.players = Array(this.numSeats).fill(null).map((_, i) => ({
      id: i,
      name: i === 0 ? 'Hero (You)' : `Seat ${i + 1}`,
      chips: this.startingChips,
      cards: [],
      bet: 0,
      isDealer: false,
      isSB: false,
      isBB: false,
      isActive: false, // is there a player sitting here?
      hasFolded: false,
      hasActed: false,
      position: '' // Preflop seat position label
    }));

    // Sit default players (let's sit all 9 by default, users can edit)
    for (let i = 0; i < 9; i++) {
      this.players[i].isActive = true;
    }

    this.dealerIdx = 0; // Rotates
    this.activePlayerIdx = 0; // Whose turn is it?
    
    this.street = ST_PREFLOP;
    this.pot = 0;
    this.currentBet = 0; // Max bet on this street
    this.lastBet = 0; // To track facing raises
    
    this.communityCards = [];
    this.deck = [];
  }

  /**
   * Initializes a brand new hand.
   * Resets cards, bets, deck, and assigns blinds.
   */
  startNewHand() {
    this.street = ST_PREFLOP;
    this.pot = 0;
    this.currentBet = 0;
    this.lastBet = 0;
    this.communityCards = [];

    // Reset player parameters for hand
    this.players.forEach(p => {
      p.cards = [];
      p.bet = 0;
      p.hasFolded = false;
      p.hasActed = false;
      p.isDealer = false;
      p.isSB = false;
      p.isBB = false;
    });

    const activeSeats = this.getActivePlayers();
    if (activeSeats.length < 2) return false;

    // Auto-reload chips to starting chips if any active player is broke (chips <= 0)
    const hasBrokePlayer = this.players.some(p => p.isActive && p.chips <= 0);
    if (hasBrokePlayer) {
      this.players.forEach(p => {
        if (p.isActive) p.chips = this.startingChips;
      });
    }

    // Rotate dealer button
    this.dealerIdx = (this.dealerIdx + 1) % this.numSeats;
    while (!this.players[this.dealerIdx].isActive) {
      this.dealerIdx = (this.dealerIdx + 1) % this.numSeats;
    }

    // Set blinds
    let sbIdx = (this.dealerIdx + 1) % this.numSeats;
    while (!this.players[sbIdx].isActive) {
      sbIdx = (sbIdx + 1) % this.numSeats;
    }

    let bbIdx = (sbIdx + 1) % this.numSeats;
    while (!this.players[bbIdx].isActive) {
      bbIdx = (bbIdx + 1) % this.numSeats;
    }

    // Apply blind configurations
    this.players[this.dealerIdx].isDealer = true;
    this.players[sbIdx].isSB = true;
    this.players[bbIdx].isBB = true;

    // Post blinds
    this.players[sbIdx].bet = Math.min(this.smallBlind, this.players[sbIdx].chips);
    this.players[sbIdx].chips -= this.players[sbIdx].bet;

    this.players[bbIdx].bet = Math.min(this.bigBlind, this.players[bbIdx].chips);
    this.players[bbIdx].chips -= this.players[bbIdx].bet;

    this.currentBet = this.bigBlind;

    // Calculate positions and active turns
    this.assignPositions();

    // Rebuild deck & deal cards
    this.buildDeck();
    this.players.forEach(p => {
      if (p.isActive) {
        p.cards = [this.drawCard(), this.drawCard()];
      }
    });

    // Preflop: action starts left of Big Blind (UTG)
    let utgIdx = (bbIdx + 1) % this.numSeats;
    while (!this.players[utgIdx].isActive) {
      utgIdx = (utgIdx + 1) % this.numSeats;
    }
    this.activePlayerIdx = utgIdx;

    return true;
  }

  buildDeck() {
    this.deck = [];
    for (let r = 0; r < 13; r++) {
      for (let s = 0; s < 4; s++) {
        this.deck.push(RANK_CHARS[r] + SUIT_CHARS[s]);
      }
    }
    // Shuffle
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.deck[i];
      this.deck[i] = this.deck[j];
      this.deck[j] = temp;
    }
  }

  drawCard() {
    return this.deck.pop();
  }

  getActivePlayers() {
    return this.players.filter(p => p.isActive);
  }

  getPlayersInHand() {
    return this.players.filter(p => p.isActive && !p.hasFolded);
  }

  /**
   * Translates 9-max seats into actual table positions relative to D button.
   */
  assignPositions() {
    const active = this.getActivePlayers();
    const count = active.length;
    if (count === 0) return;

    // Order seats starting from dealer button
    const ordered = [];
    for (let i = 0; i < this.numSeats; i++) {
      const idx = (this.dealerIdx + i) % this.numSeats;
      if (this.players[idx].isActive) {
        ordered.push(this.players[idx]);
      }
    }

    // Assign standard poker abbreviations
    if (count === 9) {
      ordered[0].position = 'BTN';
      ordered[1].position = 'SB';
      ordered[2].position = 'BB';
      ordered[3].position = 'UTG';
      ordered[4].position = 'UTG+1';
      ordered[5].position = 'MP';
      ordered[6].position = 'LJ';
      ordered[7].position = 'HJ';
      ordered[8].position = 'CO';
    } else if (count === 6) {
      ordered[0].position = 'BTN';
      ordered[1].position = 'SB';
      ordered[2].position = 'BB';
      ordered[3].position = 'UTG';
      ordered[4].position = 'MP';
      ordered[5].position = 'CO';
    } else if (count === 2) {
      // Heads up
      ordered[0].position = 'BTN/SB';
      ordered[1].position = 'BB';
    } else {
      // General fallbacks
      ordered[0].position = 'BTN';
      ordered[1].position = 'SB';
      ordered[2].position = 'BB';
      for (let j = 3; j < count; j++) {
        ordered[j].position = `MP${j - 2}`;
      }
    }
  }

  /**
   * Processes a player action:
   * action: 'fold', 'check', 'call', 'raise'
   * amount: if raise, the total targeted bet (e.g. raised TO 100)
   */
  processAction(action, amount = 0) {
    const player = this.players[this.activePlayerIdx];
    player.hasActed = true;

    if (action === 'fold') {
      player.hasFolded = true;
    } else if (action === 'check') {
      // Checking is only valid if no one has bet yet on this street (or hero matches currentBet)
      player.bet = player.bet; // stays same
    } else if (action === 'call') {
      const callDiff = this.currentBet - player.bet;
      const callVal = Math.min(callDiff, player.chips);
      player.chips -= callVal;
      player.bet += callVal;
    } else if (action === 'raise') {
      // amount is the total amount player wants to bet (so bet raises TO amount)
      const raiseDiff = amount - player.bet;
      const raiseVal = Math.min(raiseDiff, player.chips);
      player.chips -= raiseVal;
      player.bet += raiseVal;
      
      this.lastBet = this.currentBet;
      this.currentBet = player.bet;

      // When someone raises, all other active players in hand need to act again
      this.players.forEach(p => {
        if (p.id !== player.id) p.hasActed = false;
      });
    } else if (action === 'allin') {
      // All-In action
      const allinAmt = player.chips + player.bet;
      player.chips = 0;
      player.bet = allinAmt;
      
      // If going all-in is a raise/bet
      if (player.bet > this.currentBet) {
        this.lastBet = this.currentBet;
        this.currentBet = player.bet;
        // When someone raises/bets all-in, others must act again
        this.players.forEach(p => {
          if (p.id !== player.id) p.hasActed = false;
        });
      } else {
        // If going all-in is just a call/under-call, it doesn't reopen action
        // No need to reset hasActed for others
      }
    }

    this.checkHandResolution();
  }

  /**
   * Validates if betting round is completed, and shifts streets or handles hand wins.
   */
  checkHandResolution() {
    const inHand = this.getPlayersInHand();

    // 1. If only 1 player remains, they win the pot immediately
    if (inHand.length === 1) {
      this.awardPot(inHand[0]);
      return;
    }

    // 2. Check if betting round for current street is complete
    // A player has completed their action if they have folded, are all-in (chips === 0), or have acted and matched the currentBet
    const isRoundComplete = inHand.every(p => {
      return p.hasFolded || p.chips === 0 || (p.hasActed && p.bet === this.currentBet);
    });

    if (isRoundComplete) {
      // If the betting round is complete, check if we are in an All-In Runout scenario
      const withChips = inHand.filter(p => p.chips > 0);
      if (withChips.length <= 1) {
        this.runAllInRunout();
      } else {
        this.advanceStreet();
      }
    } else {
      this.moveToNextPlayer();
    }
  }

  moveToNextPlayer() {
    let nextIdx = (this.activePlayerIdx + 1) % this.numSeats;
    while (!this.players[nextIdx].isActive || this.players[nextIdx].hasFolded || this.players[nextIdx].chips === 0) {
      nextIdx = (nextIdx + 1) % this.numSeats;
    }
    this.activePlayerIdx = nextIdx;
  }

  advanceStreet() {
    // Collect all bets into the pot
    this.players.forEach(p => {
      this.pot += p.bet;
      p.bet = 0;
      p.hasActed = false;
    });

    this.currentBet = 0;
    this.lastBet = 0;

    if (this.street === ST_PREFLOP) {
      this.street = ST_FLOP;
      this.communityCards = [this.drawCard(), this.drawCard(), this.drawCard()];
    } else if (this.street === ST_FLOP) {
      this.street = ST_TURN;
      this.communityCards.push(this.drawCard());
    } else if (this.street === ST_TURN) {
      this.street = ST_RIVER;
      this.communityCards.push(this.drawCard());
    } else if (this.street === ST_RIVER) {
      this.street = ST_SHOWDOWN;
      this.resolveShowdown();
      return;
    }

    // Set first to act for post-flop (Small Blind or first active player left of Dealer button with chips)
    let actIdx = (this.dealerIdx + 1) % this.numSeats;
    while (!this.players[actIdx].isActive || this.players[actIdx].hasFolded || this.players[actIdx].chips === 0) {
      actIdx = (actIdx + 1) % this.numSeats;
    }
    this.activePlayerIdx = actIdx;
  }

  runAllInRunout() {
    // Collect all bets into the pot
    this.players.forEach(p => {
      this.pot += p.bet;
      p.bet = 0;
      p.hasActed = false;
    });
    this.currentBet = 0;
    this.lastBet = 0;

    // Deal remaining streets to the end
    while (this.street !== ST_SHOWDOWN) {
      if (this.street === ST_PREFLOP) {
        this.street = ST_FLOP;
        this.communityCards = [this.drawCard(), this.drawCard(), this.drawCard()];
      } else if (this.street === ST_FLOP) {
        this.street = ST_TURN;
        this.communityCards.push(this.drawCard());
      } else if (this.street === ST_TURN) {
        this.street = ST_RIVER;
        this.communityCards.push(this.drawCard());
      } else if (this.street === ST_RIVER) {
        this.street = ST_SHOWDOWN;
        break;
      }
    }

    this.resolveShowdown();
  }

  awardPot(winner) {
    // Sum outstanding bets
    this.players.forEach(p => {
      this.pot += p.bet;
      p.bet = 0;
    });
    
    winner.chips += this.pot;
    this.pot = 0;
    this.street = ST_SHOWDOWN;
    this.activePlayerIdx = -1;
  }

  resolveShowdown() {
    const inHand = this.getPlayersInHand();
    let bestScore = -1;
    let winners = [];

    // Evaluate each player's final 7-card hand
    const playerEvaluations = inHand.map(p => {
      const seven = [...p.cards, ...this.communityCards];
      const ev = evaluate7(seven);
      return { id: p.id, score: ev?.score || 0, ev };
    });

    playerEvaluations.forEach(pe => {
      if (pe.score > bestScore) {
        bestScore = pe.score;
        winners = [pe.id];
      } else if (pe.score === bestScore) {
        winners.push(pe.id);
      }
    });

    // Divide pot equally
    const splitPot = Math.floor(this.pot / winners.length);
    winners.forEach(wId => {
      this.players[wId].chips += splitPot;
    });

    this.pot = 0;
    this.activePlayerIdx = -1;
  }

  /**
   * Utility to retrieve standard gameState bundle for the GTO postflop heuristics
   */
  getGameStateBundle() {
    const player = this.players[this.activePlayerIdx] || { position: 'BTN', cards: ['As', 'Kh'], chips: 2000 };
    return {
      street: this.street,
      boardCards: this.communityCards,
      activePlayer: player,
      pot: this.pot + this.players.reduce((sum, p) => sum + p.bet, 0),
      lastBet: this.lastBet,
      currentBet: this.currentBet
    };
  }
}
