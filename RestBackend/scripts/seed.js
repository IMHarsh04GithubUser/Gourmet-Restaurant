const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Menu = require('../models/AdminAdd');
const items = require('../data/menu.json');
async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  await Menu.init();
  const result = await Menu.bulkWrite(items.map(item => ({ updateOne: { filter: { seedKey: item.seedKey }, update: { $setOnInsert: item }, upsert: true } })));
  console.log(`Menu ready: ${result.upsertedCount} dishes added. Existing dishes were preserved.`);
  await mongoose.disconnect();
}
seed().catch(error => { console.error('Seeding failed:', error.message); process.exitCode = 1; mongoose.disconnect(); });
