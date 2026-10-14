const jwt = require('jsonwebtoken');
const User = require('../models/employee');
const { check } = require('./validation');
const publicUser = user => ({ id: user.id, uname: user.uname, email: user.email, address: user.address, role: user.role || 'customer' });
const tokenFor = (user, secret) => jwt.sign({ sub: user.id }, secret, { expiresIn: '8h', algorithm: 'HS256' });
function auth(secret, admin = false) {
  return async (req, res, next) => {
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      check(token, 'Please sign in to continue.', 401);
      let payload;
      try { payload = jwt.verify(token, secret, { algorithms: ['HS256'] }); }
      catch { return res.status(401).json({ message: 'Your session expired. Please sign in again.' }); }
      const user = await User.findById(payload.sub);
      check(user, 'Please sign in again.', 401);
      check(!admin || user.role === 'admin', 'Admin access is required.', 403);
      req.user = user; next();
    } catch (error) { next(error); }
  };
}
function limiter(max, windowMs = 15 * 60 * 1000) {
  const hits = new Map();
  const timer = setInterval(() => { const now = Date.now(); for (const [key, value] of hits) if (value.until <= now) hits.delete(key); }, 60000);
  timer.unref();
  return (req, res, next) => {
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.until <= Date.now()) { entry = { count: 0, until: Date.now() + windowMs }; hits.set(key, entry); }
    if (++entry.count > max) { res.set('Retry-After', String(Math.ceil((entry.until - Date.now()) / 1000))); return res.status(429).json({ message: 'Too many attempts. Please try again later.' }); }
    next();
  };
}
module.exports = { auth, tokenFor, publicUser, limiter };
