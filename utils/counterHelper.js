// backend/utils/counterHelper.js
const Counter = require('../models/Counter');

/**
 * Atomically increments a named counter and returns its new numeric value.
 * 
 * Example:
 *   const seq = await getNextSequence('SKU_RIN_202511');
 *   // seq = 1, 2, 3, 4... (unique even if multiple clients add concurrently)
 */
async function getNextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter.value;
}

module.exports = { getNextSequence };
