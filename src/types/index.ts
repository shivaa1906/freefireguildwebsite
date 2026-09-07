export type UserRole = 'admin' | 'coadmin' | 'moderator' | 'member' | 'recruit';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type DiscordPresence = 'online' | 'idle' | 'dnd' | 'offline';
export const CHAT_ROLES: UserRole[] = ['admin', 'coadmin', 'moderator', 'member'];

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  channel: 'group' | 'dm';
  recipientId?: string;
  content: string;
  attachment?: {
    type: 'image' | 'document';
    name: string;
    dataUrl: string;
  };
  createdAt: string;
  seenBy?: string[];
  starred?: boolean;
  pinned?: boolean;
}

export interface ChatTypingUser {
  authorId: string;
  authorName: string;
  channel: 'group' | 'dm';
  recipientId?: string;
  isTyping: boolean;
}

export interface MemberStats {
  matches: number;
  winRate: number;
  eliminations: number;
  booyahs: number;
  accountLevel: number;
  headshotRate: number;
}

export const DEFAULT_MEMBER_STATS: MemberStats = {
  matches: 247,
  winRate: 68,
  eliminations: 1832,
  booyahs: 168,
  accountLevel: 70,
  headshotRate: 42,
};

export const EMPTY_MEMBER_STATS: MemberStats = {
  matches: 0,
  winRate: 0,
  eliminations: 0,
  booyahs: 0,
  accountLevel: 0,
  headshotRate: 0,
};

export interface GuildMember {
  id: string;
  discordId: string;
  displayName: string;
  discordName: string;
  avatar: string;
  discordDisplayName?: string;
  discordAvatar?: string;
  role: UserRole;
  status: ApprovalStatus;
  joinDate: string;
  rank: string;
  bio: string;
  achievements: string[];
  stats?: MemberStats;
  character: CharacterConfig;
  isOnline: boolean;
  presence?: DiscordPresence;
  isOwner?: boolean;
  isInDiscordGuild?: boolean;
  application?: JoinApplication;
}

export interface JoinApplication {
  fullName: string;
  gameId: string;
  experience: string;
  imageName: string;
  acceptedTerms: boolean;
}

export interface CharacterConfig {
  appearance: {
    base: string;
    hairstyle: string;
    face: string;
    skinTone: string;
  };
  outfit: {
    headwear: string;
    top: string;
    bottom: string;
    footwear: string;
  };
  accessories: {
    mask: string;
    glasses: string;
    back: string;
  };
  effects: {
    aura: string;
    cardEffect: string;
    entranceAnimation: string;
  };
}

export interface CustomizationItem {
  id: string;
  category: 'appearance' | 'outfit' | 'accessories' | 'effects';
  subcategory: string;
  name: string;
  rarity: 'standard' | 'special' | 'admin' | 'event';
  enabled: boolean;
  assignedTo?: string[];
}

export interface GuildEvent {
  id: string;
  name: string;
  type: 'custom-match' | 'tournament' | 'practice' | 'scrim' | 'recruitment';
  date: string;
  time: string;
  description: string;
  participantLimit: number;
  participants: string[];
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  date: string;
  featured: boolean;
  category: 'match' | 'rules' | 'event' | 'recruitment' | 'update';
}

export interface GuildSettings {
  id: 'guild';
  name: string;
  description: string;
}

export interface RankingTask {
  id: string;
  title: string;
  description: string;
  points: number;
  status: 'open' | 'completed';
  trigger: 'manual' | 'website-chat' | 'discord-message';
  createdBy: string;
  createdAt: string;
}

export interface RankingScore {
  id: string;
  taskId: string;
  memberId: string;
  points: number;
  awardedBy: string;
  awardedAt: string;
}

export interface RankingEntry {
  memberId: string;
  points: number;
}

export interface MapLocation {
  id: string;
  name: string;
  section: string;
  x: number;
  y: number;
  description: string;
  icon: string;
  adminOnly?: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Guild Leader',
  coadmin: 'Acting Leader',
  moderator: 'Elder',
  member: 'Guild Member',
  recruit: 'Members',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'text-neon-400',
  coadmin: 'text-neon-300',
  moderator: 'text-tactical-200',
  member: 'text-gray-300',
  recruit: 'text-warning-400',
};

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};
