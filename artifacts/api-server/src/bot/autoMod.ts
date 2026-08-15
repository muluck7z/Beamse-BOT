import {
  type Message,
  type GuildMember,
  type TextChannel,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger";
import { isUserAboveBot } from "./guards";
import { modContainer, v2Reply } from "./v2/index";

// ─── Configuration ────────────────────────────────────────────────────────────

// Regex to detect Discord invite links (discord.gg, discord.com/invite, dis.gd, etc.)
const INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite|dis\.gd)\/[A-Za-z0-9]+/i;

// Words that trigger the severe punishment (mute 27 days)
const BLOCKED_WORDS = ["dualhook", "hook"];

// Durations
const INVITE_MUTE_MS = 24 * 60 * 60 * 1000; // 24 hours
const WORD_MUTE_MS = 27 * 24 * 60 * 60 * 1000; // 27 days

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function muteMember(
  member: GuildMember,
  durationMs: number,
  reason: string
): Promise<boolean> {
  if (!member.moderatable) return false;

  // Also check if the member is above the bot
  const aboveBot = await isUserAboveBot(member, member.guild);
  if (aboveBot) return false;

  await member.timeout(durationMs, `[AutoMod] ${reason}`);
  return true;
}

async function notifyUser(message: Message, punishment: string) {
  try {
    await message.author.send(
      v2Reply([
        modContainer({
          action: punishment,
          targetTag: message.author.tag,
          targetId: message.author.id,
          moderatorTag: "AutoMod",
          reason: "Automatic punishment by server security",
          avatarUrl: message.author.displayAvatarURL({ size: 256 }),
        }),
      ])
    );
  } catch {
    // DM may be disabled — that's fine
  }
}

// ─── Main check ───────────────────────────────────────────────────────────────

/**
 * Checks a message against the auto-moderation rules.
 * Returns true if the message was handled (deleted + punished).
 */
export async function checkAutoMod(message: Message): Promise<boolean> {
  // Ignore bots
  if (message.author.bot) return false;

  // Ignore if the member has ManageMessages (staff)
  const guild = message.guild;
  if (!guild) return false;

  const member = (await guild.members.fetch(message.author.id).catch(() => null)) as
    | GuildMember
    | null;
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return false;

  const content = message.content.toLowerCase();
  const channel = message.channel as TextChannel;

  // Check blocked words first (higher priority / severity)
  const blockedWord = BLOCKED_WORDS.find((w) => content.includes(w));
  if (blockedWord) {
    // Delete the message
    await message.delete().catch(() => null);

    // Mute for 27 days
    const muted = await muteMember(
      member,
      WORD_MUTE_MS,
      `Blocked word: "${blockedWord}" (27d auto-mute)`
    );

    if (muted) {
      await notifyUser(message, "🛡️ AutoMod — Muted (27 days)");
      logger.info({ user: message.author.tag, word: blockedWord }, "AutoMod: muted 27d for blocked word");
    }
    return true;
  }

  // Check invite links
  if (INVITE_REGEX.test(content)) {
    // Delete the message
    await message.delete().catch(() => null);

    // Mute for 24 hours
    const muted = await muteMember(
      member,
      INVITE_MUTE_MS,
      "Invite link detected (24h auto-mute)"
    );

    if (muted) {
      await notifyUser(message, "🛡️ AutoMod — Muted (24h)");
      logger.info({ user: message.author.tag }, "AutoMod: muted 24h for invite link");
    }
    return true;
  }

  return false;
}
