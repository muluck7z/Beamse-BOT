import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  TextChannel,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  modContainer,
  errorContainer,
  v2Reply,
  v2EphemeralReply,
  COLORS,
  EMOJIS,
} from "../v2/index";
import { IMMUNE_ROLE_ID } from "../config";

export const banCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bans a user from the server")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to ban").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Ban reason").setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("dias")
        .setDescription("Days of messages to delete (0-7)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const user = interaction.options.getUser("user", true);
    const motivo = interaction.options.getString("motivo") ?? "No reason provided";
    const dias = interaction.options.getInteger("dias") ?? 0;

    if (user.id === interaction.user.id) {
      await interaction.reply(v2EphemeralReply([errorContainer("You cannot ban yourself.")]));
      return;
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member) {
      if (member.roles.cache.has(IMMUNE_ROLE_ID)) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("This user has an immune role and cannot be punished.")])
        );
        return;
      }

      if (!member.bannable) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("I do not have permission to ban this user.")])
        );
        return;
      }

      const interactionMember = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (
        interactionMember &&
        member.roles.highest.comparePositionTo(interactionMember.roles.highest) >= 0
      ) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer("You cannot ban a user with a role equal or higher than yours."),
          ])
        );
        return;
      }

      await member
        .send(
          v2Reply([
            modContainer({
              action: `${EMOJIS.mod} Você foi banido`,
              targetTag: user.tag,
              targetId: user.id,
              moderatorTag: interaction.user.tag,
              reason: motivo,
              avatarUrl: user.displayAvatarURL({ size: 256 }),
            }),
          ])
        )
        .catch(() => null);
    }

    await guild.bans.create(user.id, {
      reason: `[${interaction.user.tag}] ${motivo}`,
      deleteMessageSeconds: dias * 86400,
    });

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} Usuário Banido`,
          targetTag: user.tag,
          targetId: user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: user.displayAvatarURL({ size: 256 }),
          extra: dias > 0 ? `**Mensagens deletadas:** ${dias} dia(s)` : undefined,
        }),
      ])
    );

    const punishLog = interaction.client.channels.cache.get("1526621003281862768") as TextChannel | undefined;
    if (punishLog) {
      await punishLog.send({
        ...v2Reply([
          modContainer({
            action: `${EMOJIS.mod} Usuário Banido`,
            targetTag: user.tag,
            targetId: user.id,
            moderatorTag: interaction.user.tag,
            reason: motivo,
            avatarUrl: user.displayAvatarURL({ size: 256 }),
            extra: dias > 0 ? `**Mensagens deletadas:** ${dias} dia(s)` : undefined,
          })
        ]),
      }).catch(() => null);
    }
  },
};
