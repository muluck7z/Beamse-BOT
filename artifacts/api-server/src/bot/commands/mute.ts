import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { modContainer, errorContainer, v2Reply, v2EphemeralReply, COLORS, EMOJIS } from "../v2/index";
import { isUserAboveBot } from "../guards";

function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const val = parseInt(match[1]!);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (multipliers[unit] ?? 0);
}

export const muteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeouts a user")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to timeout").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("duration")
        .setDescription("Duration (e.g. 10m, 1h, 1d). Max: 28d")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Timeout reason").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const user = interaction.options.getUser("user", true);
    const durationStr = interaction.options.getString("duration", true);
    const motivo = interaction.options.getString("motivo") ?? "No reason provided";

    const ms = parseDuration(durationStr);
    if (!ms) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer("Invalid duration. Use: `10s`, `5m`, `1h`, `1d` (max: 28d)"),
        ])
      );
      return;
    }

    const maxMs = 28 * 24 * 60 * 60 * 1000;
    if (ms > maxMs) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("The maximum timeout duration is 28 days.")])
      );
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

    if (!member.moderatable) {
      await interaction.reply(v2EphemeralReply([errorContainer("I cannot timeout this user.")]));
      return;
    }

    await member.timeout(ms, `[${interaction.user.tag}] ${motivo}`);

    const until = new Date(Date.now() + ms);
    const untilTs = Math.floor(until.getTime() / 1000);

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} User Timed Out`,
          targetTag: user.tag,
          targetId: user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: user.displayAvatarURL({ size: 256 }),
          extra: `**Duration:** ${durationStr}\n**Until:** <t:${untilTs}:F>`,
        }),
      ])
    );

  },
};
