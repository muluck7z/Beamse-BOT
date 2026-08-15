export interface TicketMeta {
  openerId: string;
  openerTag: string;
  typeLabel: string;
  openedAt: Date;
  rating?: number;
  thumbnailUrl?: string;
}

// channelId → ticket metadata
export const ticketStore = new Map<string, TicketMeta>();

// guildId → panel configuration (global thumbnail for this guild)
export const ticketPanelConfig = new Map<string, { thumbnailUrl?: string }>();
