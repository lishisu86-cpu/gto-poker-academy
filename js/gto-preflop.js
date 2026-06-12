/* --- GTO Preflop Range Database & Parser --- */

import { RANK_CHARS } from './evaluator.js';

// Convert a hand string like "AKs" or "72o" or "JJ" into its (row, col) in a 13x13 starting hand grid
// The grid is indexed Ace (0) to 2 (12)
export function handToCoords(hand) {
  if (hand.length < 2) return null;
  const r1Char = hand[0].toUpperCase();
  const r2Char = hand[1].toUpperCase();
  const type = hand[2] || ''; // 's' or 'o' or empty (pair)

  // Rank index in descending order: A (0), K (1), ..., 2 (12)
  const r1 = 12 - RANK_CHARS.indexOf(r1Char);
  const r2 = 12 - RANK_CHARS.indexOf(r2Char);

  if (r1 === -1 || r2 === -1) return null;

  if (r1 === r2) {
    return { row: r1, col: r2, type: 'pair' };
  } else if (type === 's') {
    // Suited: higher rank on row, lower rank on col
    const row = Math.min(r1, r2);
    const col = Math.max(r1, r2);
    return { row, col, type: 'suited' };
  } else {
    // Offsuit: lower rank on row, higher rank on col
    const row = Math.max(r1, r2);
    const col = Math.min(r1, r2);
    return { row, col, type: 'offsuit' };
  }
}

// Convert coordinates back to hand label (e.g. row=0, col=1 -> "AKs", row=1, col=0 -> "AKo", row=0, col=0 -> "AA")
export function coordsToHand(row, col) {
  const r1Char = RANK_CHARS[12 - row];
  const r2Char = RANK_CHARS[12 - col];

  if (row === col) {
    return r1Char + r2Char;
  } else if (row < col) {
    return r1Char + r2Char + 's';
  } else {
    return r2Char + r1Char + 'o';
  }
}

/**
 * Parses a standard range formula (e.g. "AA-88, AJs+, AQo+") and returns a Set of 2-3 char hand strings.
 */
export function parseRangeFormula(formula) {
  const hands = new Set();
  if (!formula || formula.trim() === '') return hands;

  const parts = formula.split(',').map(p => p.trim());

  for (const part of parts) {
    if (part === '') continue;

    // 1. Pocket Pair Range (e.g., AA-88, or AA)
    if (part.length === 2 || (part.length === 5 && part[2] === '-')) {
      if (part.length === 2) {
        hands.add(part);
      } else {
        const h1 = part[0];
        const h2 = part[3];
        const idx1 = RANK_CHARS.indexOf(h1);
        const idx2 = RANK_CHARS.indexOf(h2);
        const minIdx = Math.min(idx1, idx2);
        const maxIdx = Math.max(idx1, idx2);
        for (let i = minIdx; i <= maxIdx; i++) {
          hands.add(RANK_CHARS[i] + RANK_CHARS[i]);
        }
      }
      continue;
    }

    // 2. Pocket Pair Plus (e.g., TT+)
    if (part.length === 3 && part[2] === '+' && part[0] === part[1]) {
      const char = part[0];
      const startIdx = RANK_CHARS.indexOf(char);
      for (let i = startIdx; i < 13; i++) {
        hands.add(RANK_CHARS[i] + RANK_CHARS[i]);
      }
      continue;
    }

    // 3. Suited / Offsuit Ranges with '-' (e.g., AJs-ATs, AQo-AJo)
    if (part.length === 7 && part[3] === '-') {
      const startHand = part.substring(0, 3);
      const endHand = part.substring(4, 7);
      const r1 = startHand[0];
      const s2 = startHand[1];
      const e2 = endHand[1];
      const type = startHand[2]; // 's' or 'o'

      const idxStart = RANK_CHARS.indexOf(s2);
      const idxEnd = RANK_CHARS.indexOf(e2);
      const minIdx = Math.min(idxStart, idxEnd);
      const maxIdx = Math.max(idxStart, idxEnd);

      for (let i = minIdx; i <= maxIdx; i++) {
        hands.add(r1 + RANK_CHARS[i] + type);
      }
      continue;
    }

    // 4. Suited / Offsuit Plus (e.g., AJs+, KTo+)
    if (part.length === 4 && part[3] === '+') {
      const r1 = part[0];
      const r2 = part[1];
      const type = part[2]; // 's' or 'o'

      const idx1 = RANK_CHARS.indexOf(r1);
      const idx2 = RANK_CHARS.indexOf(r2);

      // We go from r2 up to r1 - 1
      for (let i = idx2; i < idx1; i++) {
        hands.add(r1 + RANK_CHARS[i] + type);
      }
      continue;
    }

    // 5. Individual Suited/Offsuit Hands (e.g., KQs, ATo)
    if (part.length === 3) {
      hands.add(part);
      continue;
    }
  }

  return hands;
}

/**
 * Preflop Ranges database.
 * Each position holds a mapping of situations to formulas.
 * To make it feel premium, we support mixed strategies:
 * - We specify ranges for "raise" (red), "call" (blue), and "check" (green).
 * - Anything else is "fold" (gray).
 * - We can also define a secondary "raise_mix" or "call_mix" where we play those hands at 50% frequency.
 */
export const PREFLOP_DATA = {
  // --- UTG (Under the Gun) ---
  'UTG': {
    'RFI': {
      raise: 'AA-TT, AKs-AJs, KQs, AQo+',
      raise_mix: '99, ATs, KJs, QJs, JTs, T9s, AJo, KQo'
    },
    'vs_RFI': {
      raise: 'AA-KK, AKs',
      call: 'QQ-JJ, AQs, AKo',
      call_mix: 'TT-88, AJs, KQs, AQo'
    }
  },
  // --- MP (Middle Position) ---
  'MP': {
    'RFI': {
      raise: 'AA-99, AKs-ATs, KQs-KJs, QJs, JTs, AQo+',
      raise_mix: '88-77, A9s, K9s, QTs, T9s, 98s, AJo, KQo'
    },
    'vs_RFI': {
      raise: 'AA-QQ, AKs, AKo',
      call: 'JJ-TT, AQs-AJs, KQs',
      call_mix: '99-88, ATs, KJs, AQo'
    }
  },
  // --- CO (Cutoff) ---
  'CO': {
    'RFI': {
      raise: 'AA-77, AKs-A2s, KQs-K9s, QJs-QTs, JTs-J9s, T9s, 98s, AQo-ATo, KQo',
      raise_mix: '66-55, K8s, Q9s, T8s, 87s, AJo'
    },
    'vs_RFI': {
      raise: 'AA-QQ, AKs, AKo',
      call: 'JJ-99, AQs-AJs, KQs, AQo',
      call_mix: '88, ATs, KJs, QJs, AJo, KQo'
    }
  },
  // --- BTN (Button) ---
  'BTN': {
    'RFI': {
      raise: 'AA-55, AKs-A2s, KQs-K5s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s-97s, 87s, 76s, 65s, AKo-A9o, KQo-KTo, QJo',
      raise_mix: '44-22, K4s-K2s, Q7s, J7s, T7s, 86s, 54s, A8o-A5o, K9o, QTo, JTo'
    },
    'vs_RFI': {
      raise: 'AA-JJ, AKs, AQs, AKo',
      call: 'TT-66, AJs-ATs, KQs-KJs, QJs, JTs, AQo',
      call_mix: '55, A9s-A2s, K9s, QTs, T9s, 98s, AJo, KQo'
    }
  },
  // --- SB (Small Blind) ---
  'SB': {
    'RFI': {
      // Small blind raises or folds mostly, some calls
      raise: 'AA-44, AKs-A2s, KQs-K8s, QJs-QTs, JTs, AKo-ATo, KQo',
      raise_mix: '33-22, K7s-K2s, Q9s-Q8s, J9s, T9s, 98s, A9o-A7o, KJo-KTo, QJo'
    },
    'vs_RFI': {
      // 3-bet or fold from SB is standard GTO
      raise: 'AA-TT, AKs-AQs, AKo',
      raise_mix: '99-77, AJs-ATs, KQs, AQo'
    }
  },
  // --- BB (Big Blind) ---
  'BB': {
    'RFI': { // Big Blind facing first in (Not applicable directly, we use facing BTN/SB Raise)
      raise: 'AA-QQ, AKs',
      call: 'JJ-22, AQs-A2s, KQs-K2s, QJs-Q2s, JTs-J2s, T9s-T2s, 98s-95s, 87s-85s, 76s-75s, 65s, AKo-A2o, KQo-K9o, QJo-Q9o, JTo-J9o'
    },
    'vs_RFI': {
      // Defense from BB depends heavily on opponent position, we use a general blended GTO defense
      raise: 'AA-TT, AKs-AQs, AKo',
      call: '99-22, AJs-A2s, KQs-KJs, QJs, JTs, AQo-ATo, KQo',
      call_mix: 'K9s, QTs, T9s, 98s, 87s, AJo'
    }
  }
};

/**
 * Returns a 13x13 grid representing the GTO strategy weights for a position & scenario.
 * Each cell format:
 * {
 *   hand: "AKs",
 *   weights: { raise: 0.8, call: 0.2, check: 0, fold: 0 }
 * }
 */
export function getStrategyGrid(position, situation) {
  const grid = Array(13).fill(null).map(() => Array(13).fill(null));
  

  // Let's implement it carefully
  const posData = PREFLOP_DATA[position] || PREFLOP_DATA['BTN'];
  const sitData = posData[situation] || posData['RFI'] || { raise: '' };

  const raiseSet = parseRangeFormula(sitData.raise);
  const raiseMixSet = parseRangeFormula(sitData.raise_mix);
  const callSet = parseRangeFormula(sitData.call);
  const callMixSet = parseRangeFormula(sitData.call_mix);
  const checkSet = parseRangeFormula(sitData.check);
  const checkMixSet = parseRangeFormula(sitData.check_mix);

  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const hand = coordsToHand(r, c);
      const weights = { raise: 0, call: 0, check: 0, fold: 100 };

      if (raiseSet.has(hand)) {
        weights.raise = 100;
        weights.fold = 0;
      } else if (raiseMixSet.has(hand)) {
        weights.raise = 50;
        weights.fold = 50;
      } else if (callSet.has(hand)) {
        weights.call = 100;
        weights.fold = 0;
      } else if (callMixSet.has(hand)) {
        weights.call = 50;
        weights.fold = 50;
      } else if (checkSet.has(hand)) {
        weights.check = 100;
        weights.fold = 0;
      } else if (checkMixSet.has(hand)) {
        weights.check = 50;
        weights.fold = 50;
      }

      grid[r][c] = {
        hand,
        weights
      };
    }
  }

  return grid;
}
