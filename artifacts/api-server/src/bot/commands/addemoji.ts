import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import { type BotCommand } from "../index";
import { v2EphemeralReply, errorContainer, successContainer } from "../v2/index";
import { logger } from "../../lib/logger";

const MAX_EMOJIS = 50;

// Regex for custom emoji formats: <:name:id> or <a:name:id>
const CUSTOM_EMOJI_REGEX = /<((a)?):(\w+):(\d{17,20})>/;

export const addemojiCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("addemoji")
    .setDescription("Adds an emoji to this server automatically")
    .addStringOption((opt) =>
      opt
        .setName("emoji")
        .setDescription("Select the emoji from the picker, paste it, or type its name/id")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const raw = interaction.options.getString("emoji", true).trim();

    // Try to parse as a custom emoji directly
    const emojiMatch = raw.match(CUSTOM_EMOJI_REGEX);

    if (emojiMatch) {
      // Direct match: <:name:id> or <a:name:id>
      const isAnimated = emojiMatch[2] === "a";
      const emojiName = emojiMatch[3];
      const emojiId = emojiMatch[4];
      const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${isAnimated ? "gif" : "png"}`;

      await processAndCreateEmoji(interaction, guild, emojiId, emojiName, emojiUrl, isAnimated);
    } else {
      // Could be a name or ID — try to find the emoji in any guild the bot shares with the user
      const found = await findEmojiByNameOrId(interaction.client, raw, interaction.user.id);

      if (found) {
        const emojiUrl = `https://cdn.discordapp.com/emojis/${found.id}.${found.animated ? "gif" : "png"}`;
        await processAndCreateEmoji(interaction, guild, found.id, found.name, emojiUrl, found.animated);
      } else {
        // Check if it's a unicode emoji
        if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u.test(raw) && raw.length <= 5) {
          await interaction.reply(
            v2EphemeralReply([
              errorContainer("That's a standard Unicode emoji — it's already available to everyone. Use a custom emoji instead."),
            ])
          );
          return;
        }
        await interaction.reply(
          v2EphemeralReply([
            errorContainer("Could not find that emoji. Make sure you select a custom emoji from the picker or type its full format."),
          ])
        );
      }
    }
  },
};

async function processAndCreateEmoji(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  emojiId: string,
  emojiName: string,
  emojiUrl: string,
  isAnimated: boolean
) {
  // Check emoji count
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

  // Check if already exists
  const existing = guild.emojis.cache.find((e: any) => e.id === emojiId);
  if (existing) {
    await interaction.reply(
      v2EphemeralReply([
        errorContainer(`This emoji already exists in this server: ${existing.toString()}`),
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
          [`**Emoji:** ${newEmoji.toString()}`, `**Name:** \`${newEmoji.name}\``, `**Animated:** ${isAnimated ? "Yes" : "No"}`].join("\n")
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
}

/**
 * Searches for an emoji by name or ID across all guilds the bot shares with the user.
 */
async function findEmojiByNameOrId(
  client: any,
  query: string,
  userId: string
): Promise<{ id: string; name: string; animated: boolean } | null> {
  // If it's a numeric ID, try direct fetch
  if (/^\d{17,20}$/.test(query)) {
    try {
      const emoji = await client.rest.get(`/emojis/${query}`);
      if (emoji && emoji.id) {
        return { id: emoji.id, name: emoji.name ?? "emoji", animated: emoji.animated ?? false };
      }
    } catch {
      // Not found via REST
    }
  }

  // Search across all guilds the bot is in (that the user is also in)
  const lowerQuery = query.toLowerCase();
  for (const guild of client.guilds.cache.values()) {
    // Check if the user is in this guild
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    // Search emojis in this guild
    const emojis = await guild.emojis.fetch().catch(() => null);
    if (!emojis) continue;

    for (const emoji of emojis.values()) {
      if (emoji.name?.toLowerCase() === lowerQuery || emoji.id === query) {
        return { id: emoji.id, name: emoji.name ?? "emoji", animated: emoji.animated ?? false };
      }
    }
  }

  return null;
}
