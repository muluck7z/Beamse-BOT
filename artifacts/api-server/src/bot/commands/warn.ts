import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  TextChannel,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  modContainer,
  infoContainer,
  errorContainer,
  v2Reply,
  v2EphemeralReply,
  COLORS,
  EMOJIS,
} from "../v2/index";

const warnings = new Map<string, { motivo: string; moderador: string; data: Date }[]>();

export const warnCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Manages user warnings")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adds a warning")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Usuário").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("motivo").setDescription("Reason").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Lists a user's warnings")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Usuário").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Clears all of a user's warnings")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Usuário").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user", true);
    const key = `${guild.id}:${user.id}`;

    if (sub === "add") {
      const motivo = interaction.options.getString("motivo", true);
      const list = warnings.get(key) ?? [];
      list.push({ motivo, moderador: interaction.user.tag, data: new Date() });
      warnings.set(key, list);

      await user
        .send(
          v2Reply([
            modContainer({
              action: `${EMOJIS.mod} Você recebeu uma advertência`,
              targetTag: user.tag,
              targetId: user.id,
              moderatorTag: interaction.user.tag,
              reason: motivo,
              avatarUrl: user.displayAvatarURL({ size: 256 }),
              extra: `**Total de advertências:** ${list.length}`,
            }),
          ])
        )
        .catch(() => null);

      await interaction.reply(
        v2Reply([
          modContainer({
            action: `${EMOJIS.mod} Advertência Aplicada`,
            targetTag: user.tag,
            targetId: user.id,
            moderatorTag: interaction.user.tag,
            reason: motivo,
            avatarUrl: user.displayAvatarURL({ size: 256 }),
            extra: `**Total de advertências:** ${list.length}`,
          }),
        ])
      );
    } else if (sub === "list") {
      const list = warnings.get(key) ?? [];

      if (list.length === 0) {
        await interaction.reply(
          v2EphemeralReply([
            infoContainer({
              title: `<:escudo:1530802103612608715> Warnings for ${user.tag}`,
              description: "No warnings registered.",
              avatarUrl: user.displayAvatarURL({ size: 256 }),
            }),
          ])
        );
        return;
      }

      const warnLines = list
        .slice(-10)
        .map(
          (w, i) =>
            `**Warn #${i + 1}**\nReason: ${w.motivo} · Moderator: ${w.moderador} · <t:${Math.floor(w.data.getTime() / 1000)}:R>`
        )
        .join("\n\n");

      await interaction.reply(
        v2EphemeralReply([
          infoContainer({
            title: `<:escudo:1530802103612608715> Warnings for ${user.tag}`,
            description: `Total: **${list.length}** warning(s)\n\n${warnLines}`,
            avatarUrl: user.displayAvatarURL({ size: 256 }),
          }),
        ])
      );
    } else if (sub === "clear") {
      warnings.delete(key);
      await interaction.reply(
        v2Reply([
          modContainer({
            action: `${EMOJIS.mod} Advertências Limpas`,
            targetTag: user.tag,
            targetId: user.id,
            moderatorTag: interaction.user.tag,
            reason: "All warnings have been removed.",
            avatarUrl: user.displayAvatarURL({ size: 256 }),
          }),
        ])
      );
    }
  },
};
