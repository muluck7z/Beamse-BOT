import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import { v2EphemeralReply, errorContainer, successContainer } from "../v2/index";
import { logger } from "../../lib/logger";

const MAX_EMOJIS = 50; // Discord limit per guild

export const stealEmojisCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("stealemojis")
    .setDescription("Copies all emojis from another server using its ID")
    .addStringOption((opt) =>
      opt
        .setName("guildid")
        .setDescription("The server ID to steal emojis from")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const sourceGuildId = interaction.options.getString("guildid", true).trim();

    // Validate ID format
    if (!/^\d{17,20}$/.test(sourceGuildId)) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Invalid server ID. It must be a numeric Discord ID (17-20 digits).")])
      );
      return;
    }

    // Check if the bot is in the source guild (user must also be inside it)
    const sourceGuild = await interaction.client.guilds.fetch(sourceGuildId).catch(() => null);
    if (!sourceGuild) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer(
            "I am not in that server, or the ID is invalid. Make sure I am in the target server and you provided the correct ID."
          ),
        ])
      );
      return;
    }

    // Check if the user is also in that guild (they need access to those emojis)
    const userInGuild = await sourceGuild.members.fetch(interaction.user.id).catch(() => null);
    if (!userInGuild) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer("You are not a member of that server. You must be inside it to copy its emojis."),
        ])
      );
      return;
    }

    // Fetch all emojis from the source guild
    const fetched = await sourceGuild.emojis.fetch().catch(() => null);
    if (!fetched) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Could not fetch emojis from that server.")])
      );
      return;
    }

    // Only animated + non-animated custom emojis
    const allEmojis = fetched.filter((e) => e.animated || !e.animated); // all custom emojis
    const totalToSteal = allEmojis.size;

    if (totalToSteal === 0) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("That server has no emojis to copy.")])
      );
      return;
    }

    // Check current emoji count in the destination guild
    const destEmojis = guild!.emojis.cache;
    const destCount = destEmojis.size;
    const slotsAvailable = MAX_EMOJIS - destCount;

    if (slotsAvailable <= 0) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer(`This server already has the maximum number of emojis (${MAX_EMOJIS}). No space available.`),
        ])
      );
      return;
    }

    // Only copy as many as fit
    const toCopy = allEmojis.first(slotsAvailable);
    const willSkip = totalToSteal - toCopy.length;

    // Separate animated and static
    const animated = toCopy.filter((e) => e.animated);
    const staticEmojis = toCopy.filter((e) => !e.animated);

    const deferred = toCopy.length > 5;
    if (deferred) {
      await interaction.deferReply({ ephemeral: true });
    }

    let copied = 0;
    let failed = 0;

    // Helper to create emoji
    async function createEmoji(emoji: { name: string | null; url: string }) {
      try {
        await guild!.emojis.create({
          name: emoji.name ?? "emoji",
          attachment: emoji.url,
        });
        copied++;
      } catch (err) {
        failed++;
        // Log but continue with the rest
        logger.warn({ err, emojiName: emoji.name }, "Failed to copy emoji (continuing)");
      }
    }

    // Copy animated first, then static
    for (const emoji of animated) {
      await createEmoji(emoji);
    }
    for (const emoji of staticEmojis) {
      await createEmoji(emoji);
    }

    // Build summary
    const summaryLines = [
      `**Emojis found:** ${totalToSteal}`,
      `**Slots available:** ${slotsAvailable}`,
      `**Copied:** ${copied}`,
      `**Failed:** ${failed}`,
      `**Skipped (no space):** ${willSkip}`,
    ];

    if (!deferred) {
      await interaction.reply(
        v2EphemeralReply([successContainer("Emojis Copied!", summaryLines.join("\n"))])
      );
    } else {
      await interaction.editReply({
        ...v2EphemeralReply([successContainer("Emojis Copied!", summaryLines.join("\n"))]),
      });
    }

    logger.info(
      { sourceGuildId, total: totalToSteal, copied, failed, skipped: willSkip },
      "StealEmojis completed"
    );
  },
};
