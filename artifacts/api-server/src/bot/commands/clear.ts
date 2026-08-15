import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import { successContainer, errorContainer, v2EphemeralReply } from "../v2/index";

export const clearCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Limpa mensagens do canal")
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Quantidade de mensagens (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Only delete messages from this user")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    const channel = interaction.channel as TextChannel;
    const quantidade = interaction.options.getInteger("amount", true);
    const filtroUser = interaction.options.getUser("user");

    await interaction.deferReply({ flags: 64 });

    const messages = await channel.messages.fetch({ limit: quantidade });

    let toDelete = messages;
    if (filtroUser) {
      toDelete = messages.filter((m) => m.author.id === filtroUser.id);
    }

    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const deletable = toDelete.filter((m) => m.createdTimestamp > twoWeeksAgo);

    if (deletable.size === 0) {
      await interaction.editReply(
        v2EphemeralReply([errorContainer("No deletable messages found (max: 14 days).")])
      );
      return;
    }

    const deleted = await channel.bulkDelete(deletable, true).catch(() => null);
    const count = deleted?.size ?? 0;

    const desc = filtroUser
      ? "${count} message(s) from **${filtroUser.tag}** deleted."
      : "${count} message(s) deleted.";

    await interaction.editReply(v2EphemeralReply([successContainer("Messages Deleted", desc)]));
  },
};
