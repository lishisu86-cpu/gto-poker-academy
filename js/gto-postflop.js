/* --- GTO Postflop Board Texture Analyzer & Heuristics Advisor --- */

import { evaluate7, parseCard, RANK_CHARS } from './evaluator.js?v=20260616a';
import { PREFLOP_DATA, parseRangeFormula } from './gto-preflop.js?v=20260616a';

/**
 * Analyzes community cards to determine texture:
 * - paired: is there a pair on board?
 * - monotone: are there 3+ cards of the same suit?
 * - wetness: how coordinated is the board (dry, medium, wet)?
 * - highCardRank: highest card rank on board (0..12)
 */
export function analyzeBoardTexture(boardCards) {
  const parsed = boardCards.map(c => typeof c === 'string' ? parseCard(c) : c).filter(Boolean);
  if (parsed.length < 3) {
    return { wetness: 'dry', paired: false, monotone: false, highCardRank: -1, description: 'Preflop' };
  }

  const ranks = parsed.map(c => c.rank).sort((a,b) => b - a);
  const suits = parsed.map(c => c.suit);

  // Check for pairs/trips on board
  const rankCounts = {};
  ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
  const counts = Object.values(rankCounts);
  const paired = counts.some(c => c >= 2);
  const trips = counts.some(c => c >= 3);

  // Check for flush possibilities
  const suitCounts = [0, 0, 0, 0];
  suits.forEach(s => suitCounts[s]++);
  const maxSuitCount = Math.max(...suitCounts);
  const monotone = maxSuitCount >= 3; // 3 or more of same suit

  // Check for straight coordination (closeness)
  let straightCoordination = 0;
  const uniqueRanks = [...new Set(ranks)];
  for (let i = 0; i < uniqueRanks.length - 1; i++) {
    if (uniqueRanks[i] - uniqueRanks[i+1] <= 2) {
      straightCoordination++;
    }
  }

  // Classify wetness
  let wetness = 'dry';
  if (monotone || (straightCoordination >= 2 && !paired)) {
    wetness = 'wet';
  } else if (straightCoordination >= 1 || paired) {
    wetness = 'medium';
  }

  let desc = '';
  if (trips) desc += 'Trips Board, ';
  else if (paired) desc += 'Paired Board, ';

  if (maxSuitCount === 4) desc += '4-Flush Board, ';
  else if (maxSuitCount === 3) desc += '3-Flush Board, ';

  desc += wetness.toUpperCase();

  return {
    wetness,
    paired,
    monotone,
    highCardRank: ranks[0],
    description: desc
  };
}

/**
 * Classifies a player's actual hand structure relative to the board
 * Returns: {
 *   madeClass: "Top Pair", "Flush", etc.
 *   drawClass: "Flush Draw", "OESD", etc.
 * }
 */
export function classifyHandStrength(playerCards, boardCards) {
  const parsedPlayer = playerCards.map(c => typeof c === 'string' ? parseCard(c) : c).filter(Boolean);
  const parsedBoard = boardCards.map(c => typeof c === 'string' ? parseCard(c) : c).filter(Boolean);
  
  if (parsedPlayer.length < 2) return { madeClass: 'Unknown', drawClass: 'None' };
  if (parsedBoard.length === 0) return { madeClass: 'Preflop', drawClass: 'None' };

  const all7 = [...parsedPlayer, ...parsedBoard];
  const evalResult = evaluate7(all7);
  if (!evalResult) return { madeClass: 'Unknown', drawClass: 'None' };

  const catName = evalResult.categoryName;
  let madeClass = catName;

  // Let's refine pairs relative to board
  if (catName === 'One Pair') {
    const pairRank = parsedPlayer.find((c, i) => 
      parsedPlayer.some((c2, j) => i !== j && c.rank === c2.rank) || 
      parsedBoard.some(c2 => c.rank === c2.rank)
    )?.rank;

    if (pairRank !== undefined) {
      const boardRanks = parsedBoard.map(c => c.rank).sort((a,b) => b - a);
      if (pairRank > boardRanks[0]) {
        madeClass = 'Overpair';
      } else if (pairRank === boardRanks[0]) {
        madeClass = 'Top Pair';
      } else if (boardRanks.length >= 2 && pairRank === boardRanks[1]) {
        madeClass = 'Middle Pair';
      } else {
        madeClass = 'Weak Pair';
      }
    }
  }

  // Draw classifications (only if we don't already have a straight or flush)
  let drawClass = 'None';
  const playerSuits = parsedPlayer.map(c => c.suit);
  const boardSuits = parsedBoard.map(c => c.suit);

  if (evalResult.categoryId < 5) { // No Flush
    // Flush Draw check
    const suitCounts = [0, 0, 0, 0];
    all7.forEach(c => suitCounts[c.suit]++);
    const maxSuitCount = Math.max(...suitCounts);
    if (maxSuitCount === 4) {
      drawClass = 'Flush Draw';
    } else if (maxSuitCount === 3 && playerSuits[0] === playerSuits[1] && suitCounts[playerSuits[0]] === 3) {
      drawClass = 'Backdoor Flush Draw';
    }
  }

  if (evalResult.categoryId < 4) { // No Straight
    // Straight draw check
    const rankSet = new Set(all7.map(c => c.rank));
    // Also include Ace-low straight helper ranks
    if (rankSet.has(12)) rankSet.add(-1); // Ace acts as -1 for A-2-3-4-5

    let hasOESD = false;
    let hasGutshot = false;

    // Check for 4 consecutive ranks (OESD or double gutshot)
    for (let start = -1; start <= 8; start++) {
      let count = 0;
      for (let offset = 0; offset < 5; offset++) {
        if (rankSet.has(start + offset)) count++;
      }
      if (count === 4) {
        // Is it open-ended or gutshot?
        // If it's a 5-gap with 4 cards, it's a gutshot. E.g. 5, 7, 8, 9 is a gap of 2 (gutshot)
        // If it's 4 consecutive (e.g. 5, 6, 7, 8) and start is not -1 or 8, it's open ended.
        if (start === -1 || start === 8) {
          hasGutshot = true; // A-2-3-4-5 can only make straight on one end, same for T-J-Q-K-A
        } else {
          hasOESD = true;
        }
      }
    }

    if (hasOESD) {
      drawClass = drawClass === 'Flush Draw' ? 'Flush Draw + OESD' : 'OESD';
    } else if (hasGutshot) {
      drawClass = drawClass === 'Flush Draw' ? 'Flush Draw + Gutshot' : 'Gutshot';
    }
  }

  return {
    madeClass,
    drawClass
  };
}

/**
 * Computes GTO Heuristics advice.
 * Returns: {
 *   weights: { raise: %, call: %, check: %, fold: % },
 *   commentary: Markdown text explaining the strategy
 * }
 */
/**
 * Normalizes positions (e.g. LJ, HJ, UTG+1) to standard preflop keys.
 */
function normalizePosition(pos) {
  if (!pos) return 'BTN';
  const u = pos.toUpperCase();
  if (u.includes('BTN')) return 'BTN';
  if (u.includes('SB')) return 'SB';
  if (u.includes('BB')) return 'BB';
  if (u.includes('UTG+1')) return 'UTG';
  if (u.includes('UTG')) return 'UTG';
  if (u.includes('LJ')) return 'MP';
  if (u.includes('HJ')) return 'CO';
  if (u.includes('MP')) return 'MP';
  if (u.includes('CO')) return 'CO';
  return 'BTN';
}

/**
 * Computes GTO Heuristics advice.
 * Returns: {
 *   weights: { raise: %, call: %, check: %, fold: % },
 *   commentary: Markdown text explaining the strategy
 * }
 */
export function getGTOAdvice(gameState) {
  const { street, boardCards, activePlayer, pot, lastBet, currentBet } = gameState;
  const { position, cards, chips } = activePlayer;

  // 1. Preflop Advice
  if (street === 'preflop') {
    const bigBlindVal = gameState.bigBlind || 20;
    
    // Find the highest bet made by any OTHER player
    let raiser = null;
    let maxOtherBet = 0;
    if (gameState.players) {
      gameState.players.forEach(p => {
        if (p.isActive && !p.hasFolded && p.id !== activePlayer.id) {
          if (p.bet > maxOtherBet) {
            maxOtherBet = p.bet;
            raiser = p;
          }
        }
      });
    }

    // Convert hole cards to grid coordinates to find baseline weights
    const card1 = cards[0];
    const card2 = cards[1];
    
    const r1 = card1[0];
    const r2 = card2[0];
    const s1 = card1[1];
    const s2 = card2[1];

    let handKey = '';
    if (r1 === r2) {
      handKey = r1 + r2;
    } else if (s1 === s2) {
      handKey = (RANK_CHARS.indexOf(r1) > RANK_CHARS.indexOf(r2) ? r1 + r2 : r2 + r1) + 's';
    } else {
      handKey = (RANK_CHARS.indexOf(r1) > RANK_CHARS.indexOf(r2) ? r1 + r2 : r2 + r1) + 'o';
    }

    // Situation determination
    let situation = 'RFI';
    if (raiser && maxOtherBet > bigBlindVal) {
      const raiserPos = normalizePosition(raiser.position);
      situation = `vs_${raiserPos}`;
    } else if (raiser && maxOtherBet === bigBlindVal && normalizePosition(position) === 'BB') {
      situation = 'vs_SB';
    } else if (raiser && maxOtherBet === bigBlindVal) {
      const raiserPos = normalizePosition(raiser.position);
      situation = `vs_${raiserPos}`;
    }

    // Normalize active position
    const normActivePos = normalizePosition(position);
    const posData = PREFLOP_DATA[normActivePos];
    let sitData = null;
    if (posData) {
      sitData = posData[situation] || posData['RFI'];
    }

    // Default preflop action mapping
    let raiseWeight = 0, callWeight = 0, checkWeight = 0, foldWeight = 100;

    if (sitData) {
      const raiseSet = parseRangeFormula(sitData.raise || '');
      const raiseMixSet = parseRangeFormula(sitData.raise_mix || '');
      const callSet = parseRangeFormula(sitData.call || '');
      const callMixSet = parseRangeFormula(sitData.call_mix || '');
      const checkSet = parseRangeFormula(sitData.check || '');
      const checkMixSet = parseRangeFormula(sitData.check_mix || '');

      if (raiseSet.has(handKey)) {
        raiseWeight = 100;
        foldWeight = 0;
      } else if (raiseMixSet.has(handKey)) {
        raiseWeight = 50;
        foldWeight = 50;
      } else if (callSet.has(handKey)) {
        callWeight = 100;
        foldWeight = 0;
      } else if (callMixSet.has(handKey)) {
        callWeight = 50;
        foldWeight = 50;
      } else if (checkSet.has(handKey)) {
        checkWeight = 100;
        foldWeight = 0;
      } else if (checkMixSet.has(handKey)) {
        checkWeight = 50;
        foldWeight = 50;
      }
    } else {
      // Basic fallback heuristics if sitData is missing
      if (['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo'].includes(handKey)) {
        raiseWeight = 100; foldWeight = 0;
      } else if (['TT', '99', '88', 'AQs', 'AQo', 'AJs', 'KQs'].includes(handKey)) {
        raiseWeight = 80; callWeight = 20; foldWeight = 0;
      } else if (['77', '66', '55', 'ATs', 'KJs', 'QJs', 'JTs', 'AJo', 'KQo'].includes(handKey)) {
        if (situation === 'RFI') {
          raiseWeight = 60; foldWeight = 40;
        } else {
          callWeight = 40; foldWeight = 60;
        }
      }
    }

    const recAction = raiseWeight >= 50 ? 'RAISE' : (callWeight >= 50 ? 'CALL' : (checkWeight >= 50 ? 'CHECK' : 'FOLD'));
    
    let comm = `### Preflop GTO Strategy: **${position}** with **${handKey}**\n\n`;
    comm += `* **Position**: **${position}** (Normalized: ${normActivePos})\n`;
    comm += `* **Situation**: **${situation === 'RFI' ? 'Raise First In (RFI)' : `Facing action from ${situation.replace('vs_', '')}`}**\n\n`;
    
    comm += `#### Recommended Action Weights:\n`;
    comm += `* 🔴 **Raise / 3-Bet**: **${raiseWeight}%**\n`;
    if (callWeight > 0) comm += `* 🔵 **Call**: **${callWeight}%**\n`;
    if (checkWeight > 0) comm += `* 🟢 **Check**: **${checkWeight}%**\n`;
    comm += `* ⚫ **Fold**: **${foldWeight}%**\n\n`;
    
    comm += `#### Strategic Rationale:\n`;
    if (recAction === 'RAISE') {
      if (situation === 'RFI') {
        comm += `Based on solver-validated ranges, **${handKey}** is a clear **Open Raise** from **${position}**.\n\n`;
        comm += `Raising to 2.2x - 2.5x BB is standard GTO play here to thin the field, build a pot with your premium equity, and realize fold equity.`;
      } else {
        comm += `Facing a raise from ${situation.replace('vs_', '')}, **${handKey}** is a strong candidate for a **3-Bet (Re-raise)**.\n\n`;
        comm += `3-betting puts maximum pressure on the opener, allows you to take down the pot preflop, and builds a large pot when you have a premium holding.`;
      }
    } else if (recAction === 'CALL') {
      comm += `Based on solver-validated ranges, **${handKey}** is a **Call** from **${position}**.\n\n`;
      comm += `This hand has excellent postflop playability, but re-raising would bloat the pot unnecessarily or isolate you against stronger hands. Calling allows you to realize your equity in position or close the action.`;
    } else if (recAction === 'CHECK') {
      comm += `Based on solver-validated ranges, **${handKey}** is a **Check**.\n\n`;
      comm += `Since you are in the Big Blind and facing a complete/limp, checking is the standard GTO option to see a flop for free.`;
    } else {
      comm += `Based on solver-validated ranges, **${handKey}** is a **Fold**.\n\n`;
      if (situation === 'RFI') {
        comm += `This hand is too weak to open from **${position}**. Folding is the highest long-term EV option to conserve chips.`;
      } else {
        comm += `Facing a raise from ${situation.replace('vs_', '')}, this hand is dominated by their opening range. Folding prevents tough postflop decisions where you would be playing with a negative expected value.`;
      }
    }

    return {
      weights: { raise: raiseWeight, call: callWeight, check: checkWeight, fold: foldWeight },
      commentary: comm
    };
  }

  // 2. Postflop Heuristics
  const texture = analyzeBoardTexture(boardCards);
  const classObj = classifyHandStrength(cards, boardCards);
  const spr = chips / (pot || 1); // Stack-to-Pot Ratio

  let raiseW = 0, callW = 0, checkW = 0, foldW = 0;
  let rationale = '';

  const { madeClass, drawClass } = classObj;
  const isFacingBet = currentBet > activePlayer.bet;

  // Let's decide GTO percentages based on hand class, draws, and board texture
  if (['Royal Flush', 'Straight Flush', 'Four of a Kind', 'Full House', 'Flush', 'Straight', 'Three of a Kind'].includes(madeClass)) {
    // Monster Hands: Bet/Raise for value!
    if (isFacingBet) {
      raiseW = 60;
      callW = 40;
    } else {
      raiseW = 75; // bet
      checkW = 25; // trap/slowplay
    }
    rationale = `You hold a **Monster Hand (${madeClass})**. This is a massive value-betting scenario. We want to construct a big pot immediately, especially since the SPR is ${spr.toFixed(1)}.`;
  } else if (madeClass === 'Two Pair' || madeClass === 'Overpair' || madeClass === 'Top Pair') {
    // Strong Hands
    if (isFacingBet) {
      callW = 70;
      raiseW = 20;
      foldW = 10;
    } else {
      raiseW = 60; // bet
      checkW = 40; // pot control
    }
    rationale = `You hold a very strong made hand: **${madeClass}**. On this **${texture.wetness}** board texture, you want to bet for value but must avoid overplaying if the opponent raises significantly.`;
    
    if (texture.wetness === 'wet') {
      rationale += ` Because the board is wet and highly coordinated, you should bet larger and more frequently to charge flush/straight draws.`;
      if (!isFacingBet) raiseW += 15;
    }
  } else if (madeClass === 'Middle Pair') {
    // Medium strength hands: Pot control & bluff catch
    if (isFacingBet) {
      callW = 50;
      foldW = 50;
    } else {
      checkW = 80;
      raiseW = 20; // small defensive bet
    }
    rationale = `You hold a **Middle Pair**. This is a classic "medium-strength" showdown hand. It is too strong to fold instantly, but too weak to bet for major value. **Checking** or **calling** a moderate bet is GTO to control the pot size.`;
  } else if (madeClass === 'Weak Pair') {
    // Weak pair
    if (isFacingBet) {
      foldW = 80;
      callW = 20;
    } else {
      checkW = 90;
      raiseW = 10;
    }
    rationale = `You hold a **Weak Pair**. This hand has very little value and can easily be dominated. You should check and fold to any major aggression.`;
  } else {
    // High Card / Nothing
    if (drawClass.includes('Flush Draw') || drawClass.includes('OESD')) {
      // Strong Draw: Semi-Bluff!
      if (isFacingBet) {
        callW = 60;
        raiseW = 30;
        foldW = 10;
      } else {
        raiseW = 50; // semi-bluff bet
        checkW = 50; // free card
      }
      rationale = `You have a **Strong Draw (${drawClass})**. GTO principles recommend **semi-bluffing** with draws to build fold equity (making opponents fold better hands) while maintaining solid fallback equity if you hit on the next street.`;
    } else if (drawClass.includes('Gutshot')) {
      // Weak Draw
      if (isFacingBet) {
        foldW = 75;
        callW = 25;
      } else {
        checkW = 80;
        raiseW = 20;
      }
      rationale = `You hold a **Gutshot Straight Draw**. It has some potential, but is not strong enough to call big bets. Checking is the default option.`;
    } else {
      // Complete Air
      if (isFacingBet) {
        foldW = 100;
      } else {
        checkW = 85;
        raiseW = 15; // occasional pure bluff
      }
      rationale = `You hold complete air with no made hand and no draws. You have zero showdown value. You must check and fold to any bet.`;
    }
  }

  // Format nice output
  const comm = `### Postflop GTO Analysis (${street.toUpperCase()})

* **Your Hand**: **${madeClass}** (${drawClass !== 'None' ? `with ${drawClass}` : 'No Draw'})
* **Board Texture**: **${texture.description}**
* **SPR (Stack-to-Pot)**: **${spr.toFixed(1)}** (${spr < 2 ? 'Committed/Low SPR' : 'Deep/High SPR'})

#### Strategic Rationale:
${rationale}

> **Blocker effects**: Take note of whether your hole cards block your opponent's calling range or their potential semi-bluffing draws.
`;

  return {
    weights: {
      raise: raiseW,
      call: isFacingBet ? callW : 0,
      check: isFacingBet ? 0 : checkW,
      fold: isFacingBet ? foldW : 0
    },
    commentary: comm
  };
}
