const Counter = require('../models/Counter');

/**
 * Atomically increments a named counter and returns its new numeric value.
 */
async function getNextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter.value;
}

/**
 * Generate chit number: CHIT20240001
 */
async function generateChitNumber() {
  const year = new Date().getFullYear();
  const prefix = 'CHIT';
  
  const seq = await getNextSequence(`chit_${year}`);
  const serial = String(seq).padStart(4, '0');
  return `${prefix}${year}${serial}`;
}

/**
 * Generate receipt number: RC2024000001
 */
async function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = 'RC';
  
  const seq = await getNextSequence(`receipt_${year}`);
  const serial = String(seq).padStart(6, '0');
  return `${prefix}${year}${serial}`;
}

module.exports = { 
  getNextSequence,
  generateChitNumber,
  generateReceiptNumber
};