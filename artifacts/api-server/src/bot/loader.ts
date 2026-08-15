import { Collection } from "discord.js";
import { type BotCommand } from "./index";
import { ticketCommand } from "./commands/ticket";
import { banCommand } from "./commands/ban";
import { unbanCommand } from "./commands/unban";
import { muteCommand } from "./commands/mute";
import { unmuteCommand } from "./commands/unmute";
import { lockCommand } from "./commands/lock";
import { unlockCommand } from "./commands/unlock";
import { kickCommand } from "./commands/kick";
import { clearCommand } from "./commands/clear";
import { warnCommand } from "./commands/warn";
import { giveawayCommand } from "./commands/sorteio";
import { deployCommandsMerged, fetchRegisteredCommands } from "./deploy";
import { logger } from "../lib/logger";

const allCommands: BotCommand[] = [
  ticketCommand,
  banCommand,
  unbanCommand,
  muteCommand,
  unmuteCommand,
  lockCommand,
  unlockCommand,
  kickCommand,
  clearCommand,
  warnCommand,
  giveawayCommand,
];

/** Names of the commands that belong to Beamse-BOT. */
const ourNames = new Set(allCommands.map((c) => c.data.name));
const ourCommandsJson = () => allCommands.map((c) => c.data.toJSON());

let watcherInterval: NodeJS.Timeout | null = null;

/**
 * Command watcher: checks whether all Beamse-BOT commands are still registered.
 * If another source has overwritten them, re-deploys immediately while
 * preserving any external commands.
 */
async function watchCommands() {
  const registered = await fetchRegisteredCommands();

  if (registered === null) {
    // Couldn't fetch — try again next cycle
    return;
  }

  const registeredNames = new Set(registered.map((c) => c.name));
  const missing = [...ourNames].filter((name) => !registeredNames.has(name));

  if (missing.length > 0) {
    logger.warn(
      { missing, registeredCount: registered.length },
      "Beamse-BOT commands are missing — re-deploying now (preserving external ones)..."
    );
    try {
      await deployCommandsMerged(ourCommandsJson(), ourNames);
    } catch (err) {
      logger.error({ err }, "Emergency re-deploy failed");
    }
  } else {
    const external = registered.filter((c) => !ourNames.has(c.name));
    logger.debug(
      { total: registered.length, ours: ourNames.size, external: external.map((c) => c.name) },
      "Watcher OK — all commands present"
    );
  }
}

export async function loadCommands(commands: Collection<string, BotCommand>) {
  for (const cmd of allCommands) {
    commands.set(cmd.data.name, cmd);
  }
  logger.info({ count: allCommands.length }, "Commands loaded");

  // Initial deploy on startup — preserves any external commands already present
  try {
    await deployCommandsMerged(ourCommandsJson(), ourNames);
  } catch (err) {
    logger.error({ err }, "Initial deploy failed");
  }

  // Watcher: checks every 2 minutes that our commands are still registered
  if (!watcherInterval) {
    logger.info("Starting command watcher — checking every 2 minutes");
    watcherInterval = setInterval(() => {
      watchCommands().catch((err) =>
        logger.error({ err }, "Unexpected error in command watcher")
      );
    }, 2 * 60 * 1000);
  }
}
