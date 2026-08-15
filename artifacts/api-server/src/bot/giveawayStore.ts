export interface GiveawayEntry {
  prize: string;
  channelId: string;
  messageId: string;
  guildId: string;
  numWinners: number;
  endsAt: number;
  participants: Set<string>;
  creatorId: string;
  timer: ReturnType<typeof setTimeout>;
  ended: boolean;
}

// messageId → entry (includes ended giveaways to allow rerolls)
export const giveawayStore = new Map<string, GiveawayEntry>();

// channelId → messageId (active giveaways only)
export const giveawayByChannel = new Map<string, string>();

// channelId → messageId (last ended giveaway per channel)
export const lastEndedByChannel = new Map<string, string>();
