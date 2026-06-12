/* --- Core Engines Unit Testing Suite --- */

import { evaluate7, runMonteCarlo } from '../js/evaluator.js';
import { parseRangeFormula, coordsToHand, handToCoords } from '../js/gto-preflop.js';

console.log('==================================================');
console.log('🃏 RUNNING GTO POKER ACADEMY TESTING SUITE');
console.log('==================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

// ----------------------------------------------------
// TEST 1: Hand Evaluator Categories and Rank Tiers
// ----------------------------------------------------
console.log('--- TEST GROUP 1: Hand Evaluator ---');

// Full House vs Flush
const fullHouseHand = ['As', 'Ah', 'Ad', 'Ks', 'Kh', '2c', '3d']; // AAAKK
const flushHand = ['As', 'Ks', 'Qs', 'Js', '9s', '2h', '3d']; // Flush Spade Ace high
const straightHand = ['8c', '7d', '6h', '5s', '4c', 'Kd', 'Qh']; // 8-High straight
const tripsHand = ['Tc', 'Th', 'Ts', 'Ad', 'Kh', '2c', '3d']; // TTT

const evalFH = evaluate7(fullHouseHand);
const evalFlush = evaluate7(flushHand);
const evalStraight = evaluate7(straightHand);
const evalTrips = evaluate7(tripsHand);

assert(evalFH.categoryName === 'Full House', `Should identify Full House (Got: ${evalFH.categoryName})`);
assert(evalFlush.categoryName === 'Flush', `Should identify Flush (Got: ${evalFlush.categoryName})`);
assert(evalStraight.categoryName === 'Straight', `Should identify Straight (Got: ${evalStraight.categoryName})`);
assert(evalFH.score > evalFlush.score, 'Full House score should beat Flush score');
assert(evalFlush.score > evalStraight.score, 'Flush score should beat Straight score');
assert(evalStraight.score > evalTrips.score, 'Straight score should beat Trips score');

// Ace-low straight
const aceLowStraight = ['Ac', '2d', '3h', '4s', '5c', 'Qd', 'Kh'];
const evalAceLow = evaluate7(aceLowStraight);
assert(evalAceLow.categoryName === 'Straight' && evalAceLow.description.includes('Five-High'), `Should identify Ace-low 5-High Straight (Got: ${evalAceLow.description})`);

// ----------------------------------------------------
// TEST 2: Preflop range parses & compact notation
// ----------------------------------------------------
console.log('\n--- TEST GROUP 2: Preflop Range Parser ---');

const formula = 'AA-QQ, AJs+, AQo+';
const parsed = parseRangeFormula(formula);

assert(parsed.has('AA') && parsed.has('KK') && parsed.has('QQ') && !parsed.has('JJ'), 'Should parse pocket pairs range (AA-QQ)');
assert(parsed.has('AKs') && parsed.has('AQs') && parsed.has('AJs') && !parsed.has('ATs'), 'Should parse suited plus range (AJs+)');
assert(parsed.has('AKo') && parsed.has('AQo') && !parsed.has('AJo'), 'Should parse offsuit plus range (AQo+)');

// Coord transforms
const c1 = handToCoords('AKs');
assert(c1.row === 0 && c1.col === 1 && c1.type === 'suited', 'AKs coords should map to row 0, col 1');
const h1 = coordsToHand(0, 1);
assert(h1 === 'AKs', 'row 0, col 1 should reverse map back to AKs');

// ----------------------------------------------------
// TEST 3: Monte Carlo simulation correctness
// ----------------------------------------------------
console.log('\n--- TEST GROUP 3: Monte Carlo Simulation ---');

const players = [
  { id: 0, cards: ['As', 'Ah'] }, // AA
  { id: 1, cards: ['Ks', 'Kh'] }  // KK
];
const community = [];

console.log('Running 2000 runs of AA vs KK...');
const start = Date.now();
const equities = runMonteCarlo(players, community, 2000);
const duration = Date.now() - start;

const aaEquity = equities.find(e => e.id === 0).equity;
const kkEquity = equities.find(e => e.id === 1).equity;

console.log(`AA Equity: ${(aaEquity * 100).toFixed(2)}% (Mathematical theoretical target: ~82%)`);
console.log(`KK Equity: ${(kkEquity * 100).toFixed(2)}% (Mathematical theoretical target: ~18%)`);
console.log(`Time taken: ${duration}ms`);

assert(aaEquity > 0.78 && aaEquity < 0.86, 'AA Equity should fall in range ~82% ± 4%');
assert(kkEquity > 0.14 && kkEquity < 0.22, 'KK Equity should fall in range ~18% ± 4%');

console.log('\n==================================================');
console.log(`🏁 TESTING COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log('==================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
