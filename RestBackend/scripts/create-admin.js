const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/employee');
const { email, password, check } = require('../lib/validation');
async function main() {
  const normalized = email(process.env.ADMIN_EMAIL);
  const rawPassword = process.env.ADMIN_PASSWORD;
  check(rawPassword && rawPassword !== 'change-this-password', 'Set a unique ADMIN_PASSWORD in .env.');
  password(rawPassword);
  await mongoose.connect(process.env.MONGO_URI); await User.init();
  const existing = await User.findOne({ email: normalized });
  if (existing) {
    existing.role = 'admin'; await existing.save();
    console.log('Existing account promoted. Its current password was preserved.');
  } else {
    await User.create({ uname: process.env.ADMIN_NAME || 'Garden Admin', email: normalized, password: await bcrypt.hash(rawPassword, 12), role: 'admin' });
    console.log('Admin account created.');
  }
  await mongoose.disconnect();
}
main().catch(error => { console.error('Admin setup failed:', error.message); process.exitCode = 1; mongoose.disconnect(); });
