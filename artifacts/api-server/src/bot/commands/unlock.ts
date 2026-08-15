import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, successContainer, v2Reply, v2EphemeralReply, COLORS } from "../v2/index";

export const unlockCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlocks the channel for @everyone")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to unlock (default: current)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const canal = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;
    const everyoneRole = guild.roles.everyone;

    await canal.permissionOverwrites.edit(everyoneRole, {
      SendMessages: null,
      AddReactions: null,
      CreatePublicThreads: null,
      CreatePrivateThreads: null,
    });

    await canal.send(
      v2Reply([
        infoContainer({
          title: "<:escudo:1530802103612608715> Channel Unlocked",
          description: `This channel was unlocked by ${interaction.user}.`,
        }),
      ])
    );

    await interaction.reply(
      v2EphemeralReply([
        successContainer("Channel Unlocked", "${canal} was unlocked successfully."),
      ])
    );
  },
};
