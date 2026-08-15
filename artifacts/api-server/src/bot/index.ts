import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type GuildMember,
  MessageFlags,
} from "discord.js";
import { logger } from "../lib/logger";
import { loadCommands } from "./loader";
import { handleButton } from "./handlers/button";
import { handleSelectMenu } from "./handlers/selectMenu";
import { errorContainer } from "./v2/index";

export interface BotCommand {
  data: { name: string; toJSON(): object };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

const client = new Client({
  // Privileged intents enabled in the Discord Developer Portal by the owner.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

export const commands = new Collection<string, BotCommand>();

async function replyAccessDenied(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
) {
  const payload = {
    components: [
      errorContainer(
        "You do not have permission to use the bot.\nOnly **Moderators** and **Administrators** can use the commands."
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }
}

export async function startBot() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.error("DISCORD_BOT_TOKEN is not set");
    return;
  }

  await loadCommands(commands);

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag, guilds: c.guilds.cache.size }, "Bot is online and ready");
  });

  client.on("interactionCreate", async (interaction) => {
    // Interactions outside a guild (DM) are not allowed
    if (!interaction.inGuild()) return;

    const guild = interaction.guild;

    // The GuildMembers intent is disabled, so interaction.member may be
    // missing — fall back to a REST fetch to check staff permissions.
    let member = interaction.member as GuildMember | null;
    if (!member && guild) {
      member = await guild.members.fetch(interaction.user.id).catch(() => null);
    }

    // Ticket interactions are public — any member can open/interact with their ticket
    const isTicketInteraction =
      (interaction.isStringSelectMenu() || interaction.isButton()) &&
      "customId" in interaction &&
      interaction.customId.startsWith("ticket:");

    // Everything else requires staff permissions
    const isStaff =
      member &&
      (member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages) ||
        member.permissions.has(PermissionFlagsBits.ModerateMembers));

    if (!isTicketInteraction && !isStaff) {
      await replyAccessDenied(
        interaction as ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
      );
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction as ChatInputCommandInteraction);
      } catch (err) {
        logger.error({ err, command: interaction.commandName }, "Command error");
        const payload = {
          components: [errorContainer("An error occurred while executing this command.")],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => null);
        } else {
          await interaction.reply(payload).catch(() => null);
        }
      }
    } else if (interaction.isButton()) {
      await handleButton(interaction as ButtonInteraction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction as StringSelectMenuInteraction);
    }
  });

  await client.login(token);
}

export { client };
