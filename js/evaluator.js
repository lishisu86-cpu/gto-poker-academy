/* --- High-Performance Poker Hand Evaluator & Monte Carlo Simulator --- */

// Constants mapping
export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs'; // clubs, diamonds, hearts, spades
export const SUIT_SYMBOLS = { 'c': '♣', 'd': '♦', 'h': '♥', 's': '♠' };

export const HAND_CATEGORIES = {
  9: 'Royal Flush',
  8: 'Straight Flush',
  7: 'Four of a Kind',
  6: 'Full House',
  5: 'Flush',
  4: 'Straight',
  3: 'Three of a Kind',
  2: 'Two Pair',
  1: 'One Pair',
  0: 'High Card'
};

/**
 * Parses a card string (e.g. "As", "Td", "2c") into a standardized object:
 * { rank: 0..12, suit: 0..3, str: "As" }
 */
export function parseCard(cardStr) {
  if (!cardStr || cardStr.length < 2) return null;
  const rankChar = cardStr[0].toUpperCase();
  const suitChar = cardStr[1].toLowerCase();

  const rank = RANK_CHARS.indexOf(rankChar);
  const suit = SUIT_CHARS.indexOf(suitChar);

  if (rank === -1 || suit === -1) return null;
  return { rank, suit, str: rankChar + suitChar };
}

/**
 * Stringifies a standard card object back to string (e.g. "As")
 */
export function cardToString(card) {
  if (!card) return '';
  return RANK_CHARS[card.rank] + SUIT_CHARS[card.suit];
}

/**
 * Evaluates a 5-card poker hand and returns a numeric score:
 * score = category * 1,000,000 + tie_breaker_value
 */
export function evaluate5(cards) {
  // Sort cards in descending order of rank
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  
  const ranks = sorted.map(c => c.rank);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  
  // Check for straight
  let isStraight = false;
  let straightHighRank = -1;

  // Normal straight check
  if (
    ranks[0] - ranks[1] === 1 &&
    ranks[1] - ranks[2] === 1 &&
    ranks[2] - ranks[3] === 1 &&
    ranks[3] - ranks[4] === 1
  ) {
    isStraight = true;
    straightHighRank = ranks[0];
  } else if (
    ranks[0] === 12 && // Ace
    ranks[1] === 3 &&  // 5
    ranks[2] === 2 &&  // 4
    ranks[3] === 1 &&  // 3
    ranks[4] === 0     // 2
  ) {
    // Ace-low straight (A-2-3-4-5)
    isStraight = true;
    straightHighRank = 3; // 5 is the high card
  }

  // Count rank frequencies
  const counts = {};
  for (const r of ranks) {
    counts[r] = (counts[r] || 0) + 1;
  }
  
  const frequencyArray = Object.entries(counts).map(([rank, count]) => ({
    rank: parseInt(rank),
    count
  })).sort((a, b) => b.count - a.count || b.rank - a.rank);

  // 1. Royal / Straight Flush
  if (isFlush && isStraight) {
    if (straightHighRank === 12) {
      return 9 * 1000000; // Royal Flush
    }
    return 8 * 1000000 + straightHighRank; // Straight Flush
  }

  // 2. Four of a Kind
  if (frequencyArray[0].count === 4) {
    const fourRank = frequencyArray[0].rank;
    const kickerRank = frequencyArray[1].rank;
    return 7 * 1000000 + (fourRank * 15 + kickerRank);
  }

  // 3. Full House
  if (frequencyArray[0].count === 3 && frequencyArray[1].count === 2) {
    const threeRank = frequencyArray[0].rank;
    const pairRank = frequencyArray[1].rank;
    return 6 * 1000000 + (threeRank * 15 + pairRank);
  }

  // 4. Flush
  if (isFlush) {
    // base-15 tie breaker for 5 cards descending
    const val = ranks[0] * 50625 + ranks[1] * 3375 + ranks[2] * 225 + ranks[3] * 15 + ranks[4];
    return 5 * 1000000 + val;
  }

  // 5. Straight
  if (isStraight) {
    return 4 * 1000000 + straightHighRank;
  }

  // 6. Three of a Kind
  if (frequencyArray[0].count === 3) {
    const threeRank = frequencyArray[0].rank;
    const k1 = frequencyArray[1].rank;
    const k2 = frequencyArray[2].rank;
    return 3 * 1000000 + (threeRank * 225 + k1 * 15 + k2);
  }

  // 7. Two Pair
  if (frequencyArray[0].count === 2 && frequencyArray[1].count === 2) {
    const p1 = frequencyArray[0].rank;
    const p2 = frequencyArray[1].rank;
    const kicker = frequencyArray[2].rank;
    return 2 * 1000000 + (p1 * 225 + p2 * 15 + kicker);
  }

  // 8. One Pair
  if (frequencyArray[0].count === 2) {
    const pairRank = frequencyArray[0].rank;
    const k1 = frequencyArray[1].rank;
    const k2 = frequencyArray[2].rank;
    const k3 = frequencyArray[3].rank;
    return 1 * 1000000 + (pairRank * 3375 + k1 * 225 + k2 * 15 + k3);
  }

  // 9. High Card
  const val = ranks[0] * 50625 + ranks[1] * 3375 + ranks[2] * 225 + ranks[3] * 15 + ranks[4];
  return 0 * 1000000 + val;
}

/**
 * Helper to generate combinations of k items from array
 */
function combinations(arr, k) {
  const result = [];
  function helper(start, combo) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

/**
 * Evaluates a 7-card poker hand and returns the best 5-card evaluation
 * Result format: { score: number, category: string, description: string, cards5: Array }
 */
export function evaluate7(cards) {
  if (cards.length < 5) return null;
  
  // Parse string cards to objects if necessary
  const parsedCards = cards.map(c => typeof c === 'string' ? parseCard(c) : c).filter(Boolean);
  if (parsedCards.length < 5) return null;

  const combos = combinations(parsedCards, 5);
  let bestScore = -1;
  let bestCards = null;

  for (const combo of combos) {
    const score = evaluate5(combo);
    if (score > bestScore) {
      bestScore = score;
      bestCards = combo;
    }
  }

  const categoryId = Math.floor(bestScore / 1000000);
  const categoryName = HAND_CATEGORIES[categoryId];
  
  // Format details
  const details = getScoreDescription(bestScore, bestCards);

  return {
    score: bestScore,
    categoryId,
    categoryName,
    description: details,
    cards5: bestCards
  };
}

/**
 * Returns a human-friendly string description of a 5-card evaluated hand
 */
function getScoreDescription(score, cards) {
  const categoryId = Math.floor(score / 1000000);
  const tie = score % 1000000;
  
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const rankNames = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const rankPlurals = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

  switch(categoryId) {
    case 9:
      return 'Royal Flush';
    case 8:
      return `Straight Flush, ${rankNames[tie]}-High`;
    case 7: {
      const fourRank = Math.floor(tie / 15);
      const kickerRank = tie % 15;
      return `Four of a Kind, ${rankPlurals[fourRank]} (Kicker ${rankNames[kickerRank]})`;
    }
    case 6: {
      const threeRank = Math.floor(tie / 15);
      const pairRank = tie % 15;
      return `Full House, ${rankPlurals[threeRank]} over ${rankPlurals[pairRank]}`;
    }
    case 5:
      return `Flush, ${rankNames[sorted[0].rank]}-High`;
    case 4:
      return `Straight, ${rankNames[tie]}-High`;
    case 3: {
      const threeRank = Math.floor(tie / 225);
      return `Three of a Kind, ${rankPlurals[threeRank]}`;
    }
    case 2: {
      const p1 = Math.floor(tie / 225);
      const p2 = Math.floor((tie % 225) / 15);
      return `Two Pair, ${rankPlurals[p1]} and ${rankPlurals[p2]}`;
    }
    case 1: {
      const pairRank = Math.floor(tie / 3375);
      return `One Pair of ${rankPlurals[pairRank]}`;
    }
    default:
      return `High Card, ${rankNames[sorted[0].rank]}`;
  }
}

/**
 * Monte Carlo simulator to calculate winning equity for active players.
 * 
 * players: Array of objects representing the active table players. Format:
 *   { id: 0..8, cards: [card1, card2] } // cards can be string or objects, or null/empty if random
 * communityCards: Array of string cards or card objects already dealt on table.
 * totalRuns: Number of simulation iterations (default 1000).
 * 
 * Returns array of equity percentages for each player.
 */
export function runMonteCarlo(players, communityCards, totalRuns = 1000) {
  const parsedCommunity = communityCards.map(c => typeof c === 'string' ? parseCard(c) : c).filter(Boolean);
  
  // Format players' cards, parsing string representation
  const activePlayers = players.map(p => {
    const cards = (p.cards || []).map(c => typeof c === 'string' ? parseCard(c) : c).filter(Boolean);
    return {
      id: p.id,
      knownCards: cards,
      wins: 0
    };
  });

  // Extract all currently known cards to avoid dealing duplicates
  const knownCardsSet = new Set();
  parsedCommunity.forEach(c => knownCardsSet.add(cardToString(c)));
  activePlayers.forEach(p => p.knownCards.forEach(c => knownCardsSet.add(cardToString(c))));

  // Build the remaining deck of cards
  const fullDeck = [];
  for (let r = 0; r < 13; r++) {
    for (let s = 0; s < 4; s++) {
      const cardStr = RANK_CHARS[r] + SUIT_CHARS[s];
      if (!knownCardsSet.has(cardStr)) {
        fullDeck.push({ rank: r, suit: s, str: cardStr });
      }
    }
  }

  // Run iterations
  for (let run = 0; run < totalRuns; run++) {
    // Shuffle remaining deck (Fisher-Yates) - only need to draw enough cards
    const deck = [...fullDeck];
    let deckIdx = 0;
    
    const shuffleAndDraw = (num) => {
      const drawn = [];
      for (let i = 0; i < num; i++) {
        const rand = deckIdx + Math.floor(Math.random() * (deck.length - deckIdx));
        // Swap
        const temp = deck[deckIdx];
        deck[deckIdx] = deck[rand];
        deck[rand] = temp;
        
        drawn.push(deck[deckIdx]);
        deckIdx++;
      }
      return drawn;
    };

    // 1. Fill community cards to 5
    const simCommunity = [...parsedCommunity];
    if (simCommunity.length < 5) {
      const remainingCount = 5 - simCommunity.length;
      simCommunity.push(...shuffleAndDraw(remainingCount));
    }

    // 2. Assign hole cards for players who don't have them
    const simPlayers = activePlayers.map(p => {
      const cards = [...p.knownCards];
      if (cards.length < 2) {
        const remainingCount = 2 - cards.length;
        cards.push(...shuffleAndDraw(remainingCount));
      }
      return {
        id: p.id,
        hole: cards
      };
    });

    // 3. Evaluate and find winner
    let maxScore = -1;
    let winners = [];

    for (const p of simPlayers) {
      const sevenCards = [...p.hole, ...simCommunity];
      const evalResult = evaluate7(sevenCards);
      
      if (!evalResult) continue;

      if (evalResult.score > maxScore) {
        maxScore = evalResult.score;
        winners = [p.id];
      } else if (evalResult.score === maxScore) {
        winners.push(p.id);
      }
    }

    // 4. Distribute wins (equal split for ties)
    const winIncrement = 1 / winners.length;
    for (const winnerId of winners) {
      const p = activePlayers.find(ap => ap.id === winnerId);
      if (p) p.wins += winIncrement;
    }
  }

  // Calculate equity ratios
  return activePlayers.map(p => ({
    id: p.id,
    equity: p.wins / totalRuns
  }));
}
