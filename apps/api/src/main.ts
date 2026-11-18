import { buildApp } from "./app.js";
import { buildConfig, loadEnvFiles } from "./config.js";

loadEnvFiles();
const config = buildConfig();
const app = await buildApp({ config });

if (config.sessionSecretEphemeral) {
  app.log.warn("SESSION_SECRET not set — using a random per-process value (dev only). Set it in production.");
}
app.log.info({ billing: config.BILLING_PROVIDER, web: config.webOrigin }, "maindy api starting");

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.API_PORT, host: config.API_HOST });
} catch (err) {
  app.log.error({ err }, "failed to start");
  process.exit(1);
}
