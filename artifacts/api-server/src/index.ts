import { logger } from "./lib/logger";
import { startBot } from "./bot/index";

startBot().catch((err) => {
  logger.error({ err }, "Failed to start bot");
  process.exit(1);
});
