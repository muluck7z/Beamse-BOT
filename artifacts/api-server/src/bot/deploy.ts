import { REST, Routes } from "discord.js";
import { logger } from "../lib/logger";

function makeRest() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];
  if (!token || !clientId) return null;
  return { rest: new REST({ version: "10" }).setToken(token), clientId };
}

/**
 * Fetches all commands currently registered on Discord (full objects).
 * Returns null on error.
 */
export async function fetchRegisteredCommands(): Promise<
  Array<{ name: string; [key: string]: unknown }> | null
> {
  const ctx = makeRest();
  if (!ctx) return null;

  try {
    const registered = (await ctx.rest.get(
      Routes.applicationCommands(ctx.clientId)
    )) as Array<{ name: string; [key: string]: unknown }>;
    return registered;
  } catch (err) {
    logger.warn({ err }, "Could not fetch registered commands");
    return null;
  }
}

/**
 * Deploys commands while merging Beamse-BOT commands with external commands
 * already registered (e.g. other bots). External commands are preserved —
 * never deleted.
 *
 * @param ourCommands  Beamse-BOT command list (toJSON())
 * @param ourNames     Set of our command names (used to filter out external ones)
 */
export async function deployCommandsMerged(ourCommands: object[], ourNames: Set<string>) {
  const ctx = makeRest();
  if (!ctx) {
    logger.warn("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID — skipping deploy");
    return;
  }

  // Fetch current commands to preserve external ones
  const current = await fetchRegisteredCommands();
  const external = current ? current.filter((c) => !ourNames.has(c.name)) : [];

  if (external.length > 0) {
    logger.info({ external: external.map((c) => c.name) }, "Preserving external commands");
  }

  const merged = [...external, ...ourCommands];

  try {
    logger.info(
      { total: merged.length, ours: ourCommands.length, external: external.length },
      "Deploying commands (Beamse-BOT + external)"
    );
    await ctx.rest.put(Routes.applicationCommands(ctx.clientId), { body: merged });
    logger.info("Deploy finished successfully — all commands registered");
  } catch (err) {
    logger.error({ err }, "Command deploy failed");
    throw err;
  }
}
