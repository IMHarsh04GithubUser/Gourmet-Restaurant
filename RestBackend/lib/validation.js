class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function check(condition, message, status = 400) { if (!condition) throw new HttpError(status, message); }
function text(value, label, min = 1, max = 500) {
  check(typeof value === 'string', `${label} is required.`);
  const clean = value.trim();
  check(clean.length >= min && clean.length <= max, `${label} must contain ${min}–${max} characters.`);
  return clean;
}
function email(value) {
  const clean = text(value, 'Email', 3, 254).toLowerCase();
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean), 'Enter a valid email address.'); return clean;
}
function phone(value) {
  const clean = text(value, 'Phone', 10, 20).replace(/[\s()-]/g, '');
  check(/^(?:\+91)?[6-9]\d{9}$/.test(clean), 'Enter a valid Indian mobile number.'); return clean;
}
function password(value) {
  check(typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value) <= 72, 'Password must contain at least 8 characters and at most 72 bytes.'); return value;
}
const objectId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
module.exports = { HttpError, check, text, email, phone, password, objectId };
