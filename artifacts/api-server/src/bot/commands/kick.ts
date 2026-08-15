import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { modContainer, errorContainer, v2Reply, v2EphemeralReply, COLORS, EMOJIS } from "../v2/index";
import { isUserAboveBot } from "../guards";

export const kickCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kicks a user from the server")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to kick").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Kick reason").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const user = interaction.options.getUser("user", true);
    const motivo = interaction.options.getString("motivo") ?? "No reason provided";

    if (user.id === interaction.user.id) {
      await interaction.reply(v2EphemeralReply([errorContainer("You cannot kick yourself.")]));
      return;
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply(v2EphemeralReply([errorContainer("User not found on the server.")]));
      return;
    }

    if (await isUserAboveBot(member, guild)) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("This user has a role above the bot and cannot be punished.")])
      );
      return;
    }

    if (!member.kickable) {
      await interaction.reply(v2EphemeralReply([errorContainer("I cannot kick this user.")]));
      return;
    }

    await member
      .send(
        v2Reply([
          modContainer({
            action: `${EMOJIS.mod} Você foi expulso`,
            targetTag: user.tag,
            targetId: user.id,
            moderatorTag: interaction.user.tag,
            reason: motivo,
            avatarUrl: user.displayAvatarURL({ size: 256 }),
          }),
        ])
      )
      .catch(() => null);

    await member.kick(`[${interaction.user.tag}] ${motivo}`);

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} User Kicked`,
          targetTag: user.tag,
          targetId: user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );

  },
};
