const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true }, username: String,
  questionIds: [String], expiresAt: Date, completed: { type: Boolean, default: false }, score: Number,
}, { timestamps: true });
schema.index({ completed: 1, score: -1 });
// Only unfinished attempts expire; completed scores remain on the leaderboard.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { completed: false } });
module.exports = mongoose.model('QuizAttempt', schema);
