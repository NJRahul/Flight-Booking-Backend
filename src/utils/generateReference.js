const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const generateBookingRef = () => {
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return result;
};

const generateTransactionId = () => {
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return `TXN${Date.now()}${suffix}`;
};

module.exports = { generateBookingRef, generateTransactionId };
