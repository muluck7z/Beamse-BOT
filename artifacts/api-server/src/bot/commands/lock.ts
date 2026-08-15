import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  infoContainer,
  successContainer,
  v2Reply,
  v2EphemeralReply,
  COLORS,
} from "../v2/index";

export const lockCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Locks the channel for @everyone")
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Lock reason").setRequired(false)
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to lock (default: current)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const canal = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;
    const motivo = interaction.options.getString("motivo") ?? "No reason provided";
    const everyoneRole = guild.roles.everyone;

    await canal.permissionOverwrites.edit(everyoneRole, {
      SendMessages: false,
      AddReactions: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
    });

    await canal.send(
      v2Reply([
        infoContainer({
          title: "<:escudo:1530802103612608715> Channel Locked",
          description: `This channel was locked by ${interaction.user}.\n**Reason:** ${motivo}\n\nUse \`/unlock\` to unlock it.`,
        }),
      ])
    );

    await interaction.reply(
      v2EphemeralReply([
        successContainer("Channel Locked", "${canal} was locked successfully."),
      ])
    );
  },
};
