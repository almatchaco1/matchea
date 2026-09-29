// Stamp card: 1 stamp per drink bought; 9 stamps = 1 free drink (the 10th is free).
export const STAMPS_PER_REWARD = 9;

export const drinkCount = (lines) => (lines || []).reduce((a, l) => a + (Math.floor(+l.qty) || 0), 0);

/** Free-drink value: the base (regular-size) price of the dearest drink in the order. Upsize and add-ons are still paid. */
export const rewardValue = (bases) => Math.max(0, ...(bases || []).map((b) => +b || 0));

/** Stamps a completed order earns (the free drink itself doesn't earn one). */
export const stampsFor = (lines, usedReward) => Math.max(0, drinkCount(lines) - (usedReward ? 1 : 0));

export const rewardsReady = (stamps) => Math.floor((+stamps || 0) / STAMPS_PER_REWARD);
export const stampProgress = (stamps) => (+stamps || 0) % STAMPS_PER_REWARD;
