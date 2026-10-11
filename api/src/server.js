import "dotenv/config";
import http from "http";
import { env } from "./config/env.js";
import { app } from "./app.js";
import { connectMongo, disconnectMongo } from "./db/connect.js";
import { connectRedis, shutdownRedis, redis } from "./db/redis.js";
import { otpStoreInit } from "./services/otp.service.js";
import { initRealtime } from "./realtime/io.js";
import { startSweeps, stopSweeps } from "./jobs/sweeps.js";
import { applyIndexes } from "./scripts/db.indexes.js";
import { log } from "./config/logger.js";

const l = log("server");

const server = http.createServer(app);

async function main() {
  await connectMongo();   // refuses to boot without a replica set (transactions)
  await connectRedis();
  otpStoreInit(redis);
  initRealtime(server);
  await applyIndexes(true); // idempotent
  await startSweeps();

  server.listen(env.PORT, () => {
    l.info(`API listening on :${env.PORT} (${env.NODE_ENV})`);
    l.info(`web → http://localhost:5173   admin → http://localhost:5174`);
    l.warn("Local mode: OTP codes are shown in the player app; online payments are disabled.");
  });
}

async function shutdown(signal) {
  l.info({ signal }, "shutting down");
  server.close();
  await stopSweeps();
  await shutdownRedis();
  await disconnectMongo();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  l.error({ err: err.message }, "failed to start");
  process.exit(1);
});