import { logger } from "./lib/logger";
import { startBot } from "./bot/index";

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
});

startBot().catch((err) => {
  logger.error({ err }, "Failed to start bot");
  process.exit(1);
});
