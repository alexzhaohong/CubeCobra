// Exports
// MAX_SCORE : number
// FETCH_LANDS : { [str]: [Color] }
// COLORS : [Color]
// BASICS : [str]
// ORACLES : [oracle]
// ORACLES_BY_NAME : { [string]: oracle }
// getSynergy : (int, int, [Card]) -> number
// considerInCombination : ([Color], Card) -> bool
// isPlayableLand : ([Color], Card) -> bool
// getCastingProbability : (Card, { [ColorCombination]: int }) -> number
// getProbability : (int, [Card], { [str]: number }) -> number
// evaluteCard : (int, DrafterState) -> BotScore & {
//   colors : [Color],
//   lands : { [ColorCombination]: int },
//   probability : number,
//   probabilities : { [str]: number },
// }
// getDrafterState : (Draft, int, int?) -> DrafterState

import seedrandom from 'seedrandom';
import shuffleSeed from 'shuffle-seed';

import { COLOR_COMBINATIONS, COLOR_INCLUSION_MAP, cardColorIdentity, cardElo, cardName, cardType } from 'utils/Card';
import { arraysAreEqualSets, fromEntries } from 'utils/Util';

// Maximum value each oracle can achieve.
export const MAX_SCORE = 10;
export const FETCH_LANDS = Object.freeze({
  'Arid Mesa': ['W', 'R'],
  'Bloodstained Mire': ['B', 'R'],
  'Flooded Strand': ['W', 'U'],
  'Marsh Flats': ['W', 'B'],
  'Misty Rainforest': ['U', 'G'],
  'Polluted Delta': ['U', 'B'],
  'Scalding Tarn': ['U', 'R'],
  'Verdant Catacombs': ['B', 'G'],
  'Windswept Heath': ['W', 'G'],
  'Wooded Foothills': ['R', 'G'],
  'Prismatic Vista': [...'WUBRG'],
  'Fabled Passage': [...'WUBRG'],
  'Terramorphic Expanse': [...'WUBRG'],
  'Evolving Wilds': [...'WUBRG'],
});
const COLOR_COMBINATION_INDICES = fromEntries(COLOR_COMBINATIONS.map((comb, i) => [comb.join(''), i]));
const COLOR_COMBINATION_INCLUDES = new Uint8Array(32 * 32);
for (const [comb1, i] of Object.entries(COLOR_COMBINATION_INDICES)) {
  for (const [comb2, j] of Object.entries(COLOR_COMBINATION_INDICES)) {
    COLOR_COMBINATION_INCLUDES[i * 32 + j] = COLOR_INCLUSION_MAP[comb1][comb2] ? 255 : 0;
  }
}
const COLOR_COMBINATION_INTERSECTS = new Uint8Array(32 * 32);
for (const [comb1, i] of Object.entries(COLOR_COMBINATION_INDICES)) {
  for (const [comb2, j] of Object.entries(COLOR_COMBINATION_INDICES)) {
    COLOR_COMBINATION_INTERSECTS[i * 32 + j] = [...comb1].some((c) => [...comb2].includes(c)) ? 255 : 0;
  }
}
export const COLORS = Object.freeze([...'WUBRG']);
export const BASICS = Object.freeze(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);

// This function gets approximate weight values when there are not 15 cards in the pack.
// It treat pack/pick number out of 3/15 as a lattice and just average the surrounding points
// weighted by distance if the desired point is off the lattice.
const interpolateWeight = (weights, coordMaxPair, ...coordinates) => {
  if (!weights.length) {
    if (weights.length === 0) {
      return 0;
    }
    return weights;
  }
  const [coordinate, maxCoordinate] = coordMaxPair;
  const coordPercent = coordinate / maxCoordinate;
  const index = weights.length * coordPercent;
  const ceilIndex = Math.ceil(index);
  const floorIndex = Math.floor(index);
  // Is either an integer or is past the end by less than 1 so we can use floor as our index
  if (index === floorIndex || ceilIndex === weights.length) {
    return interpolateWeight(weights[Math.min(floorIndex, weights.length - 1)], ...coordinates);
  }
  // Ceil must be at most weights.length - 1 and floor must be ceil - 1 and at least 0
  // so the indexes below must be valid.
  // The fractional part of index.
  const indexModOne = index - floorIndex;
  // If is fractional and not past the end we weight it by the two
  // closest points by how close it is to that point.
  return (
    indexModOne * interpolateWeight(weights[ceilIndex], ...coordinates) +
    (1 - indexModOne) * interpolateWeight(weights[floorIndex], ...coordinates)
  );
};

const synergyCache = {};
export const getSynergy = (index1, index2, cards) => {
  const card1 = cards[index1];
  const card2 = cards[index2];
  const name1 = cardName(card1);
  const name2 = cardName(card2);
  let synergy = synergyCache[name1]?.[name2];
  if ((synergy ?? null) === null) {
    if (!synergyCache[name1]) synergyCache[name1] = {};
    if (!synergyCache[name2]) synergyCache[name2] = {};
    const embedding1 = card1.details.embedding;
    const embedding2 = card2.details.embedding;
    synergy = 0;
    if (embedding1 && embedding2) {
      for (let i = 0; i < 64; i++) {
        synergy += embedding1[i] * embedding2[i];
      }
    }
    synergy *= MAX_SCORE;
    synergyCache[name1][name2] = synergy;
    synergyCache[name2][name1] = synergy;
  }
  return synergy;
};

export const considerInCombination = (combination, card) =>
  card && COLOR_INCLUSION_MAP[combination.join('')][(cardColorIdentity(card) ?? []).join('')];

const BASICS_MAP = { w: 'Plains', u: 'Island', b: 'Swamp', r: 'Mountain', g: 'Forest' };
export const isPlayableLand = (colors, card) =>
  considerInCombination(colors, card) ||
  colors.filter((c) => cardColorIdentity(card).includes(c)).length > 1 ||
  (FETCH_LANDS[cardName(card)] && FETCH_LANDS[cardName(card)].some((c) => colors.includes(c))) ||
  colors.some((color) => cardType(card).toLowerCase().includes(BASICS_MAP[color.toLowerCase()].toLowerCase()));

export const getCastingProbability = () => {
  return 1;
};

const sum = (arr) => {
  let result = 0;
  for (const x of arr) result += x;
  return result;
};

const eloToValue = (elo) => 10 ** (((elo ?? 1200) - 1200) / 800);

const sumWeightedRatings = (idxs, cards, p) => {
  if (idxs.length === 0) return 0;
  let result = 0;
  for (const ci of idxs) {
    result += p[ci] * eloToValue(cardElo(cards[ci]));
  }
  return Math.min(MAX_SCORE, result / idxs.length);
};

const emptyEmbedding = new Float32Array(64);
const sumEmbeddings = (cards, picked, probabilities) => {
  const result = new Float32Array(64);
  for (const ci of picked) {
    const embedding = cards[ci]?.details?.embedding ?? emptyEmbedding;
    for (let i = 0; i < 64; i++) {
      result[i] += probabilities[ci] * embedding[i];
    }
  }
  return result;
};

const dotProduct = (embedding1, embedding2) => {
  let result = 0;
  for (let i = 0; i < 64; i++) {
    result += embedding1[i] * embedding2[i];
  }
  return result;
};

const calculateWeight = (weights, { packNum, pickNum, numPacks, packSize }) =>
  interpolateWeight(weights, [packNum, numPacks], [pickNum, packSize]);

export const ORACLES = Object.freeze(
  [
    {
      title: 'Rating',
      tooltip: 'The rating based on the elo and current color commitments.',
      perConsideredCard: true,
      weights: [
        [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
        [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
      ],
      // What is the raw power level of this card? Used to assess how much we want to play this card.
      computeValue: ({ cardIndices, cards, probabilities }) => sumWeightedRatings(cardIndices, cards, probabilities),
    },
    {
      title: 'Pick Synergy',
      tooltip: 'A score of how well this card synergizes with the current picks.',
      perConsideredCard: true,
      weights: [
        [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
        [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
        [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      ],
      // How much does the card we're considering synergize with the cards we've picked?
      // Helps us assess how much we want to play this card.
      computeValue: ({ cardIndices, cards, probabilities: p, totalProbability: total, poolEmbedding }) =>
        total > 0 && cardIndices.length > 0
          ? (MAX_SCORE * dotProduct(sumEmbeddings(cards, cardIndices, p), poolEmbedding)) / total / cardIndices.length
          : 0,
    },
    {
      title: 'Internal Synergy',
      tooltip: 'A score of how well current picks in these colors synergize with each other.',
      perConsideredCard: false,
      weights: [
        [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
        [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15],
      ],
      // How much do the cards we've already picked in this combo synergize with each other?
      // Helps us assess what colors we want to play.
      // Tends to recommend sticking with colors we've been picking.
      computeValue: ({ picked, totalProbability: total, basics, poolEmbedding }) =>
        // The weighted sum of each pair's synergy divided by the total number of pairs is quadratic
        // in the ratio of playable cards. Then that ratio would be the dominant factor, dwarfing
        // the synergy values, which undermines our goal. Instead we can treat it as the weighted
        // average over the Pick Synergy of each picked card with the rest. There are two ordered
        // pairs for every distinct unordered pair so we multiply by 2.
        total > 0 && picked.length + basics.length > 1
          ? (2 * MAX_SCORE * dotProduct(poolEmbedding, poolEmbedding)) / (picked.length + basics.length - 1) / total
          : 0,
    },
    // {
    //   title: 'External Synergy',
    //   tooltip:
    //     'A score of how cards picked so far synergize with the other cards in these colors that have been seen so far.',
    //   perConsideredCard: false,
    //   weights: [
    //     [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    //     [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    //     [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    //   ],
    //   // How much do the cards we've already picked in this combo synergize with each other?
    //   // Helps us assess what colors we want to play.
    //   // Tends to recommend moving into less heavily picked colors.
    //   computeValue: ({ seen, cards, probabilities: p, totalProbability: total, poolEmbedding }) =>
    //     total > 0 && seen.length > 0
    //       ? (MAX_SCORE * dotProduct(sumEmbeddings(cards, seen, p), poolEmbedding)) / sum(p) / seen.length
    //       : 0,
    // },
    {
      title: 'Colors',
      tooltip: 'A score of how well these colors fit in with the current picks.',
      perConsideredCard: false,
      weights: [
        [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15],
        [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25],
        [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
      ],
      // How good are the cards we've already picked in this color combo?
      // Used to select a color combination.
      // Tends to recommend what we've already picked before.
      computeValue: ({ picked, basics, probabilities, cards }) =>
        sumWeightedRatings(picked, cards, probabilities) + sumWeightedRatings(basics, cards, probabilities),
    },
    {
      title: 'Openness',
      tooltip: 'A score of how open these colors appear to be.',
      perConsideredCard: true,
      weights: [
        [4, 12, 12.3, 12.6, 13, 13.4, 13.7, 14, 15, 14.6, 14.2, 13.8, 13.4, 13, 12.6],
        [13, 12.6, 12.2, 11.8, 11.4, 11, 10.6, 10.2, 9.8, 9.4, 9, 8.6, 8.2, 7.8, 7],
        [8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1],
      ],
      // Has this color combination been flowing openly?
      // Used to select a color combination. Tends to recommend new colors to try.
      computeValue: ({ seen, cards, probabilities }) => sumWeightedRatings(seen, cards, probabilities),
    },
  ].map((oracle) => ({ ...oracle, computeWeight: (drafterState) => calculateWeight(oracle.weights, drafterState) })),
);
export const ORACLES_BY_NAME = Object.freeze(fromEntries(ORACLES.map((oracle) => [oracle.title, oracle])));

const getAvailableLands = (pool, basics, cards) => {
  const availableLands = new Uint8Array(32);
  for (const cardIndex of pool.concat(...basics.map((ci) => new Array(17).fill(ci)))) {
    const card = cards[cardIndex];
    if (cardType(card).toLowerCase().includes('land')) {
      const colors = FETCH_LANDS[cardName(card)] ?? cardColorIdentity(card);
      const key = (COLOR_COMBINATIONS.find((comb) => arraysAreEqualSets(comb, colors)) ?? []).join('');
      availableLands[COLOR_COMBINATION_INDICES[key]] += 1;
    }
  }
  return availableLands;
};

const getRandomLands = (availableLands, seed = 0) => {
  const rng = seedrandom(seed);
  const currentLands = new Uint8Array(availableLands);
  let totalLands = currentLands.reduce((x, y) => x + y, 0);
  while (totalLands > 17) {
    if (currentLands[0] > 0) {
      currentLands[0] -= 1;
      totalLands -= 1;
    } else {
      const availableDecreases = [];
      for (let i = 0; i < 32; i++) {
        if (currentLands[i] > 0) availableDecreases.push(i);
      }
      const trueDecreases = availableDecreases.filter(
        (i) => !availableDecreases.some((j) => i !== j && COLOR_COMBINATION_INCLUDES[i * 32 + j]),
      );
      const removal = shuffleSeed.shuffle(trueDecreases, rng())[0];
      // Provide some decently random mixing to allow seed to provide decent randomness
      totalLands -= 1;
      currentLands[removal] -= 1;
    }
  }
  return currentLands;
};

const calculateProbabilities = ({ cards, seen, picked, basics, lands }) => {
  // const seenSet = [...new Set(seen.concat(picked, basics))].map((ci) => [ci, cards[ci]]);
  const packedLands = new Uint32Array(lands.buffer);
  const res = new Float32Array(cards.length);
  for (const col of [seen, picked, basics]) {
    for (const ci of col) {
      res[ci] = res[ci] > 0 ? res[ci] : getCastingProbability(cards[ci], packedLands);
    }
  }
  for (let i = 0; i < res.length; i++) {
    if (res[i] < 0.2) res[i] **= 5;
    else if (res[i] < 0.33) res[i] **= 3;
    else if (res[i] < 0.5) res[i] **= 2;
  }
  return res;
};

const calculateScore = (botState) => {
  const oracleResults = ORACLES.map(({ title, tooltip, computeWeight, computeValue }) => ({
    title,
    tooltip,
    weight: computeWeight(botState),
    value: computeValue(botState),
  }));
  const score = oracleResults.reduce((acc, { weight, value }) => acc + weight * value, 0);
  if (botState.cardIndices.length === 0) {
    const nonlandProbability = sum(
      botState.picked
        .filter(
          (ci) => !cardType(botState.cards[ci]).match(/land/i) && cardColorIdentity(botState.cards[ci]).length > 0,
        )
        .map((ci) => botState.probabilities[ci])
        .sort((a, b) => a - b)
        .slice(0, 23),
    );
    return {
      score: score * nonlandProbability,
      oracleResults,
      nonlandProbability,
      botState,
    };
  }
  return {
    score,
    oracleResults,
    botState,
  };
};

const findTransitions = ({ botState: { lands, availableLands } }) => {
  const availableIncreases = [];
  const availableDecreases = [];
  for (let i = 0; i < 32; i++) {
    if (availableLands[i] > lands[i]) availableIncreases.push(i);
    if (lands[i] > 0) availableDecreases.push(i);
  }
  const trueIncreases = availableIncreases.filter(
    (i) => !availableIncreases.some((j) => i !== j && COLOR_COMBINATION_INCLUDES[j * 32 + i]),
  );
  const trueDecreases = availableDecreases.filter(
    (i) => !availableDecreases.some((j) => i !== j && COLOR_COMBINATION_INCLUDES[i * 32 + j]),
  );
  const result = [];
  for (const increase of trueIncreases) {
    for (const decrease of trueDecreases) {
      if (!COLOR_COMBINATION_INCLUDES[decrease * 32 + increase]) {
        result.push([increase, decrease]);
      }
    }
  }
  return result;
};

const findBetterLands = (currentScore) => {
  const { botState } = currentScore;
  let result = currentScore;
  for (const [increase, decrease] of findTransitions(currentScore)) {
    const lands = new Uint8Array(botState.lands);
    lands[increase] += 1;
    lands[decrease] -= 1;
    const newBotState = { ...botState, lands };
    newBotState.probabilities = calculateProbabilities(newBotState);
    newBotState.totalProbability = sum(newBotState.probabilities);
    newBotState.poolEmbedding = sumEmbeddings(newBotState.cards, newBotState.picked, newBotState.probabilities);
    const newScore = calculateScore(newBotState);
    if (newScore.score > result.score) {
      // We assume we won't get caught in a local maxima so it's safe to take first ascent.
      // return newScore;
      result = newScore;
    }
  }
  return result;
};

export const evaluateCardsOrPool = (cardIndices, drafterState) => {
  if ((cardIndices ?? null) === null) cardIndices = [];
  if (!Array.isArray(cardIndices)) cardIndices = [cardIndices];
  let bestScore = { score: -5 };
  for (let i = 0; i < 2; i++) {
    const initialBotState = { ...drafterState, cardIndices };
    initialBotState.availableLands = getAvailableLands(
      [...drafterState.picked, ...cardIndices],
      drafterState.basics,
      drafterState.cards,
    );
    initialBotState.lands = getRandomLands(
      initialBotState.availableLands,
      drafterState.pickNumber + i * 5 + cardIndices.reduce((acc, x) => acc + acc * x, 1),
    );
    let currentScore = { score: -1, botState: initialBotState };
    let prevScore = { ...currentScore, score: -2 };
    while (prevScore.score < currentScore.score) {
      prevScore = currentScore;
      currentScore = findBetterLands(currentScore);
    }
    if (currentScore.score > bestScore.score) bestScore = currentScore;
  }
  if (!bestScore.oracleResults) {
    bestScore.botState.probabilities = calculateProbabilities(bestScore.botState);
    bestScore.botState.totalProbability = sum(bestScore.botState.probabilities);
    bestScore.botState.poolEmbedding = sumEmbeddings(
      bestScore.botState.cards,
      bestScore.botState.picked,
      bestScore.botState.probabilities,
    );
    bestScore = calculateScore(bestScore.botState);
  }
  const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (let i = 0; i < 32; i++) {
    for (const color of COLOR_COMBINATIONS[i]) {
      colorCounts[color] += bestScore.botState.lands[i];
    }
  }
  bestScore.colors = Object.entries(colorCounts)
    .filter(([, v]) => v > 2)
    .map(([k]) => k);
  return bestScore;
};

export const calculateBotPick = (drafterState, reverse = false) =>
  drafterState.cardsInPack
    .map((cardIndex) => [evaluateCardsOrPool(cardIndex, drafterState).score, cardIndex])
    .sort(([a], [b]) => (reverse ? a - b : b - a))[0][1];

export const calculateBotPickFromOptions = (options) => (drafterState) =>
  options
    .map((packIndices) => packIndices.map((pi) => [drafterState.cardsInPack[pi], pi]).filter(([x]) => x || x === 0))
    .filter((option) => option.length > 0)
    .map((option) => [
      evaluateCardsOrPool(
        option.map(([x]) => x),
        drafterState,
      ).score,
      option,
    ])
    .sort(([a], [b]) => a - b)[0][1];
