import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  TextChannel,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { modContainer, errorContainer, v2Reply, v2EphemeralReply, COLORS, EMOJIS } from "../v2/index";

export const unbanCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unbans a user")
    .addStringOption((opt) =>
      opt.setName("userid").setDescription("ID of the user to unban").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Unban reason").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const userId = interaction.options.getString("userid", true);
    const motivo = interaction.options.getString("reason") ?? "No reason provided";

    const ban = await guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await interaction.reply(v2EphemeralReply([errorContainer("This user is not banned.")]));
      return;
    }

    await guild.bans.remove(userId, `[${interaction.user.tag}] ${motivo}`);

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} User Unbanned`,
          targetTag: ban.user.tag,
          targetId: ban.user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: ban.user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );

  },
};
