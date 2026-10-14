const nodemailer = require('nodemailer');
function createMailer(env) {
  const user = env.GMAIL_USER?.trim();
  const pass = env.GMAIL_PASS?.replace(/\s/g, '');
  if (!user || !pass) return async () => false;
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass }, connectionTimeout: 5000, socketTimeout: 7000 });
  return async (to, subject, message) => {
    try { await transport.sendMail({ from: `Gourmat Garden <${user}>`, to, subject, text: message }); return true; }
    catch (error) { console.warn('Optional email could not be sent; the saved request is unaffected. Mail error code:', error.code || error.name || 'unknown', 'SMTP response:', error.responseCode || 'unavailable'); return false; }
  };
}
module.exports = { createMailer };
