'use strict';
// Usage: npm run hash-password -- "YourStrongPassword"
const crypto = require('crypto');
const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Usage: npm run hash-password -- "your-password-of-at-least-10-characters"');
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pw, salt, 64);
console.log('\nPut this in your environment as ADMIN_PASSWORD_HASH:\n');
console.log('scrypt$' + salt.toString('hex') + '$' + hash.toString('hex') + '\n');
console.log('Also generate SESSION_SECRET with:');
console.log('node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
