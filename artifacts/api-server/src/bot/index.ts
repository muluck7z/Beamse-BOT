import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ChannelType,
  PermissionFlagsBits,
  type TextChannel,
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
  // Privileged intents (GuildMembers, MessageContent) are intentionally disabled —
  // they are not enabled in the Discord Developer Portal for this bot.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
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

  client.once("ready", async (c) => {
    logger.info({ tag: c.user.tag }, "Bot is ready");

    for (const [, guild] of c.guilds.cache) {
      try {
        // Fetch the bot member via REST — the GuildMembers intent is disabled,
        // so guild.members.me may be missing from the cache.
        const me = guild.members.me ?? (await guild.members.fetch(c.user.id).catch(() => null));
        if (!me) continue;

        const channel = guild.channels.cache.find(
          (ch): ch is TextChannel =>
            ch.type === ChannelType.GuildText &&
            ch
              .permissionsFor(me)
              ?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.MentionEveryone]) === true
        );

        if (!channel) {
          logger.warn({ guild: guild.name }, "No channel available to send the online message");
          continue;
        }

        await channel.send("🔄 Bot online! @everyone");
        logger.info({ guild: guild.name, channel: channel.name }, "Online message sent");
      } catch (err) {
        logger.error({ err, guild: guild.name }, "Failed to send online message");
      }
    }
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
