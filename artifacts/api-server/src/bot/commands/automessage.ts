import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import { v2EphemeralReply, errorContainer, successContainer } from "../v2/index";
import { logger } from "../../lib/logger";

// Active automessage tasks: commandId → { accountToken, channelId, message, minMs, maxMs, interval, running }
const activeTasks = new Map<string, {
  accountToken: string;
  channelId: string;
  message: string;
  minMs: number;
  maxMs: number;
  interval: NodeJS.Timeout | null;
  running: boolean;
  userId: string;
}>();

// Modal IDs mapping
const MODAL_TYPE = {
  CONFIG: "automessage:config",
  STOP: "automessage:stop",
};

export const automessageCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("automessage")
    .setDescription("Auto-message system with human-like timing")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Opens the configuration form to start auto-messaging")
    )
    .addSubcommand((sub) =>
      sub
        .setName("stop")
        .setDescription("Stops the auto-message task in the current context")
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Shows the current auto-message status")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    if (!guild) return;

    if (sub === "start") {
      // Open a modal for configuration
      const modal = new ModalBuilder()
        .setCustomId(MODAL_TYPE.CONFIG)
        .setTitle("Auto Message Configuration");

      const tokenInput = new TextInputBuilder()
        .setCustomId("token_account")
        .setLabel("Token Account")
        .setPlaceholder("Paste the Discord account token")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const channelInput = new TextInputBuilder()
        .setCustomId("id_channel")
        .setLabel("Channel ID")
        .setPlaceholder("Paste the channel ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const messageInput = new TextInputBuilder()
        .setCustomId("message")
        .setLabel("Message")
        .setPlaceholder("The message to be sent automatically")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const minTimeInput = new TextInputBuilder()
        .setCustomId("time_minimum")
        .setLabel("Minimum Time (seconds)")
        .setPlaceholder("Minimum 25s")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const maxTimeInput = new TextInputBuilder()
        .setCustomId("time_maximum")
        .setLabel("Maximum Time (seconds)")
        .setPlaceholder("e.g. 35")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(tokenInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(channelInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(minTimeInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(maxTimeInput)
      );

      await interaction.showModal(modal);
    } else if (sub === "stop") {
      // Stop the task for this user
      const task = Array.from(activeTasks.values()).find((t) => t.userId === interaction.user.id);
      if (!task) {
        await interaction.reply(v2EphemeralReply([errorContainer("No active auto-message task found for you.")]));
        return;
      }
      task.running = false;
      if (task.interval) clearInterval(task.interval);
      activeTasks.delete(Array.from(activeTasks.keys()).find((k) => activeTasks.get(k) === task)!);

      await interaction.reply(v2EphemeralReply([successContainer("Stopped", "Auto-message task has been stopped.")]));
      logger.info({ user: interaction.user.tag }, "Auto-message stopped by user");
    } else if (sub === "status") {
      const task = Array.from(activeTasks.values()).find((t) => t.userId === interaction.user.id);
      if (!task) {
        await interaction.reply(v2EphemeralReply([errorContainer("No active auto-message task.")]));
        return;
      }
      await interaction.reply(
        v2EphemeralReply([
          successContainer(
            "Auto Message — Active",
            [
              `**Channel:** <#${task.channelId}>`,
              `**Interval:** ${Math.floor(task.minMs / 1000)}s — ${Math.floor(task.maxMs / 1000)}s`,
              `**Status:** Running`,
            ].join("\n")
          ),
        ])
      );
    }
  },
};

/**
 * Handles the modal submission for auto-message configuration
 */
export async function handleAutomessageModal(interaction: ModalSubmitInteraction) {
  const accountToken = interaction.fields.getTextInputValue("token_account").trim();
  const channelId = interaction.fields.getTextInputValue("id_channel").trim();
  const message = interaction.fields.getTextInputValue("message").trim();
  const minTimeStr = interaction.fields.getTextInputValue("time_minimum").trim();
  const maxTimeStr = interaction.fields.getTextInputValue("time_maximum").trim();

  // Validate
  const minTime = parseInt(minTimeStr, 10);
  const maxTime = parseInt(maxTimeStr, 10);

  if (isNaN(minTime) || isNaN(maxTime)) {
    await interaction.reply(v2EphemeralReply([errorContainer("Time values must be valid numbers (in seconds).")]));
    return;
  }

  if (minTime < 25) {
    await interaction.reply(v2EphemeralReply([errorContainer("Minimum time must be at least 25 seconds.")]));
    return;
  }

  if (maxTime < minTime) {
    await interaction.reply(v2EphemeralReply([errorContainer("Maximum time must be greater than or equal to minimum time.")]));
    return;
  }

  if (!accountToken || !channelId || !message) {
    await interaction.reply(v2EphemeralReply([errorContainer("All fields are required.")]));
    return;
  }

  if (!/^\d{17,20}$/.test(channelId)) {
    await interaction.reply(v2EphemeralReply([errorContainer("Invalid channel ID format. It must be a numeric Discord ID.")]));
    return;
  }

  // Stop any existing task for this user
  const existingTask = Array.from(activeTasks.values()).find((t) => t.userId === interaction.user.id);
  if (existingTask) {
    existingTask.running = false;
    if (existingTask.interval) clearInterval(existingTask.interval);
  }

  const minMs = minTime * 1000;
  const maxMs = maxTime * 1000;

  // Create the task
  const taskId = `auto:${interaction.user.id}`;
  const task = {
    accountToken,
    channelId,
    message,
    minMs,
    maxMs,
    interval: null as NodeJS.Timeout | null,
    running: true,
    userId: interaction.user.id,
  };
  activeTasks.set(taskId, task);

  await interaction.reply(
    v2EphemeralReply([
      successContainer(
        "Auto Message Started!",
        [
          `**Channel:** <#${channelId}>`,
          `**Interval:** ${minTime}s — ${maxTime}s`,
          `**Message:** ${message.slice(0, 50)}${message.length > 50 ? "..." : ""}`,
          "",
          "The bot will send messages with human-like timing. Use `/automessage stop` to stop.",
        ].join("\n")
      ),
    ])
  );

  // Start the sending loop with a poller
  let nextSendAt = Date.now() + randomBetween(minMs, maxMs);

  task.interval = setInterval(() => {
    if (!task.running) return;
    if (Date.now() >= nextSendAt) {
      sendSingleMessage(task, interaction.user);
      nextSendAt = Date.now() + randomBetween(minMs, maxMs);
    }
  }, 1000);

  logger.info(
    { user: interaction.user.tag, channelId, minTime, maxTime },
    "Auto-message task started"
  );
}

/**
 * Sends a single message using the self-bot token via REST
 * If it fails (ratelimit/timeout), it waits and retries on the next cycle — no error thrown
 */
async function sendSingleMessage(
  task: { accountToken: string; channelId: string; message: string; userId: string },
  requestUser: { tag: string; id: string }
) {
  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${task.channelId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": task.accountToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: task.message }),
    });

    if (response.ok) {
      // Success — log to user's DM
      const mainBotClient = (globalThis as any).__beamseBotClient;
      if (mainBotClient) {
        try {
          const user = await mainBotClient.users.fetch(task.userId);
          await user.send(`✅ **Auto Message Log**\n\n**Channel:** <#${task.channelId}>\n**Sent:** ${new Date().toLocaleString()}\n**Message:** ${task.message.slice(0, 100)}`);
        } catch {
          // DM might be closed; ignore
        }
      }
      logger.info({ channelId: task.channelId, user: requestUser.tag }, "Auto-message sent successfully");
    } else {
      // Failed (ratelimit, 403, etc.) — wait for cooldown and continue silently
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        logger.warn(
          { retryAfter, channelId: task.channelId },
          "Auto-message rate limited — waiting before next attempt"
        );
      } else if (response.status === 429) {
        logger.warn({ channelId: task.channelId }, "Auto-message rate limited (429) — continuing silently");
      } else {
        logger.debug({ status: response.status, channelId: task.channelId }, "Auto-message send failed — will retry on next cycle");
      }
      // Don't throw — just let it retry next cycle
    }
  } catch (err) {
    // Network error — wait and retry silently
    logger.debug({ err, channelId: task.channelId }, "Auto-message network error — will retry on next cycle");
  }
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
