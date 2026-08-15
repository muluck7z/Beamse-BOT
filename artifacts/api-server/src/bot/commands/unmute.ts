import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  TextChannel,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { modContainer, errorContainer, v2Reply, v2EphemeralReply, COLORS, EMOJIS } from "../v2/index";

export const unmuteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Removes a user's timeout")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to un-timeout").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Reason").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const user = interaction.options.getUser("user", true);
    const motivo = interaction.options.getString("motivo") ?? "No reason provided";

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply(v2EphemeralReply([errorContainer("User not found on the server.")]));
      return;
    }

    if (!member.isCommunicationDisabled()) {
      await interaction.reply(v2EphemeralReply([errorContainer("This user is not timed out.")]));
      return;
    }

    await member.timeout(null, `[${interaction.user.tag}] ${motivo}`);

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} Usuário Dessilenciado`,
          targetTag: user.tag,
          targetId: user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );

    const punishLog = interaction.client.channels.cache.get("1526621003281862768") as TextChannel | undefined;
    if (punishLog) {
      await punishLog.send({
        ...v2Reply([
          modContainer({
            action: `${EMOJIS.mod} Usuário Dessilenciado`,
            targetTag: user.tag,
            targetId: user.id,
            moderatorTag: interaction.user.tag,
            reason: motivo,
            avatarUrl: user.displayAvatarURL({ size: 256 }),
          })
        ]),
      }).catch(() => null);
    }
  },
};
