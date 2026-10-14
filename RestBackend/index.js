const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const { createApp } = require("./app");
async function start() {
  if (!process.env.MONGO_URI)
    throw new Error("Set MONGO_URI in RestBackend/.env.");
  const gateway =
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
      ? new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
          timeout: 15000,
        })
      : null;
  const app = createApp({ gateway });
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  await Promise.all([
    require("./models/Order").init(),
    require("./models/employee").init(),
    require("./models/AdminAdd").init(),
  ]);
  const server = app.listen(Number(process.env.PORT) || 3000, () =>
    console.log(
      `Gourmat Garden API running on port ${process.env.PORT || 3000}`,
    ),
  );
  const shutdown = () =>
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
if (require.main === module)
  start().catch((error) => {
    console.error(
      "Startup failed:",
      error.name === "MongoServerSelectionError"
        ? "MongoDB is unreachable. Check MONGO_URI and database access."
        : error.message,
    );
    process.exitCode = 1;
  });
module.exports = { start };
