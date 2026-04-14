const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { runAutoAbsentJob, runFullDayAbsentReconciliation } = require("./services/autoCutoffScheduler");

async function checkSettings() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("No MONGO_URI or MONGODB_URI found in .env");
    return;
  }
  await mongoose.connect(mongoUri);
  console.log("DB connected, triggering runAutoAbsentJob('evening')...");
  await runAutoAbsentJob("evening");
  console.log("Evening auto-absent done.");
  console.log("Running full-day reconciliation...");
  await runFullDayAbsentReconciliation();
  console.log("All done.");
  process.exit();
}

checkSettings();
