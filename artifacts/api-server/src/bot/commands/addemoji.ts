import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import { v2EphemeralReply, errorContainer, successContainer } from "../v2/index";
import { logger } from "../../lib/logger";

const MAX_EMOJIS = 50;

export const addemojiCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("addemoji")
    .setDescription("Adds an emoji to this server automatically")
    .addStringOption((opt) =>
      opt
        .setName("emoji")
        .setDescription("The emoji to add (paste the emoji or type <:name:id>)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const raw = interaction.options.getString("emoji", true).trim();

    // Parse the emoji from the raw input
    const animatedMatch = raw.match(/<(a):(\w+):(\d{17,20})>/);
    const staticMatch = raw.match(/<(\w+):(\d{17,20})>/);

    let emojiId: string;
    let emojiName: string;
    let isAnimated = false;
    let emojiUrl: string;

    if (animatedMatch) {
      // <a:name:id>
      emojiId = animatedMatch[3];
      emojiName = animatedMatch[2];
      isAnimated = true;
      emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.gif`;
    } else if (staticMatch) {
      // <:name:id>
      emojiId = staticMatch[2];
      emojiName = staticMatch[1];
      emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png`;
    } else if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u.test(raw) && raw.length <= 5) {
      // Unicode emoji (like 👍, 😂) — can't be added as custom
      await interaction.reply(
        v2EphemeralReply([
          errorContainer("That's a standard Unicode emoji — it's already available to everyone. Use a custom emoji instead."),
        ])
      );
      return;
    } else {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer("Invalid emoji format. Paste the custom emoji like `<:nome:123456789>` or type it directly."),
        ])
      );
      return;
    }

    // Check emoji count in this guild
    const destCount = guild.emojis.cache.size;
    const slotsAvailable = MAX_EMOJIS - destCount;

    if (slotsAvailable <= 0) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer(`This server already has the maximum number of emojis (${MAX_EMOJIS}). No space available.`),
        ])
      );
      return;
    }

    // Check if the emoji already exists in this guild
    const existing = guild.emojis.cache.find((e) => e.id === emojiId);
    if (existing) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer(`This emoji already exists in this server: ${existing}`),
        ])
      );
      return;
    }

    // Create the emoji
    try {
      const newEmoji = await guild.emojis.create({
        name: emojiName,
        attachment: emojiUrl,
      });

      await interaction.reply(
        v2EphemeralReply([
          successContainer(
            "Emoji Added!",
            [`**Emoji:** ${newEmoji}`, `**Name:** \`${newEmoji.name}\``, `**Animated:** ${isAnimated ? "Yes" : "No"}`].join("\n")
          ),
        ])
      );

      logger.info({ emojiName, emojiId, guildId: guild.id }, "Emoji added via /addemoji");
    } catch (err) {
      logger.error({ err }, "Failed to create emoji");
      await interaction.reply(
        v2EphemeralReply([
          errorContainer("Failed to add the emoji. Make sure I have **Manage Emojis** permission in this server."),
        ])
      );
    }
  },
};
