import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GuildMember, UserRole, ApprovalStatus, CharacterConfig, JoinApplication, GuildEvent, Announcement, GuildSettings, GuildProfile, DiscordPresence, MemberStats, ChatMessage, ChatTypingUser, RankingTask, RankingScore } from '@/types';
import { CHAT_ROLES, EMPTY_MEMBER_STATS } from '@/types';
import { mockAnnouncements, mockEvents, mockMembers } from '@/data/mockData';
import { BACKEND_URL, guildApi } from '@/lib/api';

export type AppView =
  | 'landing'
  | 'pending'
  | 'loading'
  | 'lobby'
  | 'members'
  | 'profile'
  | 'character'
  | 'events'
  | 'ranking'
  | 'announcements'
  | 'chat'
  | 'settings'
  | 'admin';

export type ComposerTarget = 'announcement' | 'event';

interface AuthState {
  authLoading: boolean;
  isAuthenticated: boolean;
  member: GuildMember | null;
  view: AppView;
  login: () => void;
  logout: () => void;
  setView: (view: AppView) => void;
  composerTarget: ComposerTarget | null;
  openComposer: (target: ComposerTarget) => void;
  clearComposer: () => void;
  updateCharacter: (config: CharacterConfig) => void;
  updateMemberProfile: (changes: { bio?: string; stats?: MemberStats; freeFireUid?: string }) => void;
  saveHlGamingApiKey: (apiKey: string) => Promise<void>;
  chatMessages: ChatMessage[];
  typingUsers: ChatTypingUser[];
  sendChatMessage: (content: string, recipientId?: string, attachment?: ChatMessage['attachment']) => void;
  refreshChatMessages: () => void;
  sendChatTyping: (isTyping: boolean, recipientId?: string) => void;
  markChatMessagesSeen: (messageIds: string[]) => void;
  deleteChatMessage: (id: string) => void;
  approveMember: (id: string) => void;
  rejectMember: (id: string) => void;
  suspendMember: (id: string) => Promise<void>;
  updateMemberRole: (id: string, role: UserRole) => Promise<void>;
  requestAccess: () => void;
  submitJoinApplication: (application: JoinApplication) => void;
  members: GuildMember[];
  events: GuildEvent[];
  announcements: Announcement[];
  createMember: (member: GuildMember) => void;
  createEvent: (event: GuildEvent) => void;
  createAnnouncement: (announcement: Announcement) => void;
  updateAnnouncement: (id: string, changes: Partial<Announcement>) => void;
  deleteAnnouncement: (id: string) => void;
  guildSettings: GuildSettings;
  updateGuildSettings: (settings: GuildSettings) => Promise<void>;
  updateDiscordServerUrl: (discordServerUrl: string) => Promise<void>;
  updateStrongVerification: (enabled: boolean) => Promise<void>;
  deleteAccount: () => Promise<void>;
  theme: 'dark' | 'bright';
  setTheme: (theme: 'dark' | 'bright') => void;
  guildStats: { totalMembers: number; onlineMembers: number };
  guildProfile: GuildProfile | null;
  guildProfileError: string | null;
  rankingTasks: RankingTask[];
  rankingScores: RankingScore[];
  rankingError: string | null;
  createRankingTask: (task: RankingTask) => void;
  updateRankingTask: (id: string, changes: Partial<RankingTask>) => void;
  deleteRankingTask: (id: string) => void;
  awardRankingScore: (score: RankingScore) => void;
  preferences: DisplayPreferences;
  updatePreference: <K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) => void;
  notificationPermission: NotificationPermission | 'unsupported';
  requestNotifications: () => Promise<void>;
  previewNotificationSound: (sound?: DisplayPreferences['notificationSound']) => void;
  unreadChatCount: number;
}

export interface DisplayPreferences {
  reducedMotion: boolean;
  highGraphics: boolean;
  particleEffects: boolean;
  uiSoundEffects: boolean;
  ambientAudio: boolean;
  notificationSound: 'tactical' | 'double-ping' | 'soft-chime' | 'radar' | 'alert' | 'sonar' | 'custom' | 'off';
  customNotificationSound?: string;
  customNotificationName?: string;
}

const defaultPreferences: DisplayPreferences = {
  reducedMotion: false,
  highGraphics: true,
  particleEffects: true,
  uiSoundEffects: false,
  ambientAudio: false,
  notificationSound: 'tactical',
  customNotificationSound: '',
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedMember = (() => {
    try {
      return JSON.parse(localStorage.getItem('guild-auth-member') || 'null') as GuildMember | null;
    } catch {
      return null;
    }
  })();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setAuthenticated] = useState(Boolean(cachedMember));
  const [member, setMember] = useState<GuildMember | null>(cachedMember);
  const [view, setView] = useState<AppView>(cachedMember ? 'loading' : 'landing');
  const [composerTarget, setComposerTarget] = useState<ComposerTarget | null>(null);
  const [members, setMembers] = useState<GuildMember[]>(mockMembers);
  const [events, setEvents] = useState<GuildEvent[]>(mockEvents);
  const [announcements, setAnnouncements] = useState<Announcement[]>(mockAnnouncements);
  const [rankingTasks, setRankingTasks] = useState<RankingTask[]>([]);
  const [rankingScores, setRankingScores] = useState<RankingScore[]>([]);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<ChatTypingUser[]>([]);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const latestPresenceRef = useRef<Record<string, DiscordPresence>>({});
  const queuedChatPayloads = useRef<string[]>([]);
  const [guildSettings, setGuildSettings] = useState<GuildSettings>({ id: 'guild', name: 'Free Fire Guild HQ', description: 'A competitive Free Fire guild. Booyah or nothing.' });
  const [theme, setThemeState] = useState<'dark' | 'bright'>(() => (localStorage.getItem('guild-theme') as 'dark' | 'bright') || 'dark');
  const [guildStats, setGuildStats] = useState({ totalMembers: mockMembers.length, onlineMembers: mockMembers.filter((item) => item.isOnline).length });
  const [guildProfile, setGuildProfile] = useState<GuildProfile | null>(null);
  const [guildProfileError, setGuildProfileError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<DisplayPreferences>(() => {
    try {
      return { ...defaultPreferences, ...JSON.parse(localStorage.getItem('guild-preferences') || '{}') };
    } catch {
      return defaultPreferences;
    }
  });
  const ambientAudioRef = useRef<{ context: AudioContext; oscillator: OscillatorNode; gain: GainNode } | null>(null);
  const memberRef = useRef<GuildMember | null>(null);
  const notificationAudioRef = useRef<AudioContext | null>(null);
  const customNotificationSoundRef = useRef<string | undefined>(preferences.customNotificationSound);
  const customNotificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const notificationSoundRef = useRef<DisplayPreferences['notificationSound']>(preferences.notificationSound);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  memberRef.current = member;
  notificationSoundRef.current = preferences.notificationSound;
  customNotificationSoundRef.current = preferences.customNotificationSound;

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    if (typeof AudioContext !== 'undefined') {
      notificationAudioRef.current ||= new AudioContext();
      await notificationAudioRef.current.resume();
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const playNotificationSound = (selectedSound = notificationSoundRef.current) => {
    const sound = selectedSound;
    if (sound === 'off') return;
    if (sound === 'custom') {
      const customSound = customNotificationSoundRef.current;
      if (!customSound) return;
      const audio = customNotificationAudioRef.current || new Audio();
      customNotificationAudioRef.current = audio;
      audio.src = customSound;
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    const context = notificationAudioRef.current || new AudioContext();
    notificationAudioRef.current = context;
    void context.resume();
    const patterns = {
      tactical: [740, 980],
      'double-ping': [620, 620],
      'soft-chime': [520, 780],
      radar: [420, 680, 920],
      alert: [880, 660, 880],
      sonar: [360, 540],
    } as const;
    const frequencies = patterns[sound];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + index * 0.09;
      oscillator.type = sound === 'soft-chime' || sound === 'sonar' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.08, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.16);
    });
  };

    const previewNotificationSound = (sound?: DisplayPreferences['notificationSound']) => {
      playNotificationSound(sound);
    };

  const updatePreference = <K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) => {
    setPreferences((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem('guild-preferences', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', preferences.reducedMotion);
    document.documentElement.classList.toggle('low-graphics', !preferences.highGraphics);
    document.documentElement.classList.toggle('effects-disabled', !preferences.particleEffects);
  }, [preferences.reducedMotion, preferences.highGraphics, preferences.particleEffects]);

  useEffect(() => {
    const playClick = () => {
      if (!preferences.uiSoundEffects) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 520;
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
      window.setTimeout(() => void context.close(), 120);
    };
    document.addEventListener('click', playClick);
    return () => document.removeEventListener('click', playClick);
  }, [preferences.uiSoundEffects]);

  useEffect(() => {
    if (!preferences.ambientAudio) {
      const activeAudio = ambientAudioRef.current;
      if (activeAudio) {
        activeAudio.gain.gain.exponentialRampToValueAtTime(0.001, activeAudio.context.currentTime + 0.25);
        activeAudio.oscillator.stop(activeAudio.context.currentTime + 0.3);
        ambientAudioRef.current = null;
      }
      return;
    }
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 110;
    gain.gain.value = 0.012;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    ambientAudioRef.current = { context, oscillator, gain };
    return () => {
      if (ambientAudioRef.current?.oscillator === oscillator) {
        oscillator.stop();
        void context.close();
        ambientAudioRef.current = null;
      }
    };
  }, [preferences.ambientAudio]);

  const setTheme = (nextTheme: 'dark' | 'bright') => {
    if (nextTheme === theme) return;
    const applyTheme = () => {
      document.documentElement.classList.add('theme-switching');
      setThemeState(nextTheme);
      localStorage.setItem('guild-theme', nextTheme);
      document.documentElement.classList.toggle('theme-bright', nextTheme === 'bright');
      window.setTimeout(() => document.documentElement.classList.remove('theme-switching'), 500);
    };
    applyTheme();
  };

  useEffect(() => {
    document.documentElement.classList.toggle('theme-bright', theme === 'bright');
  }, [theme]);

  useEffect(() => {
    let active = true;
    Promise.all([
      guildApi.list<GuildMember>('members'),
      guildApi.list<GuildEvent>('events'),
      guildApi.list<Announcement>('announcements'),
      guildApi.list<GuildSettings>('settings'),
    ]).then(([remoteMembers, remoteEvents, remoteAnnouncements, remoteSettings]) => {
      if (!active) return;
      setMembers(remoteMembers.map((item) => {
        const presence = item.isInDiscordGuild === false
          ? 'offline' as DiscordPresence
          : latestPresenceRef.current[item.discordId] || item.presence;
        return {
          ...item,
          ...(item.role === ('elite' as UserRole) ? { role: 'member' as UserRole } : {}),
          ...(presence ? { presence, isOnline: presence !== 'offline' } : {}),
        };
      }));
      setEvents(remoteEvents);
      setAnnouncements(remoteAnnouncements);
      if (remoteSettings.length) setGuildSettings(remoteSettings[0]);
    }).catch(() => {
      // The mock collections keep the UI usable while MongoDB is offline.
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!guildSettings.guildOwnerUid && !member?.freeFireUid && !member?.application?.gameId) return;
    guildApi.guildProfile<GuildProfile>()
      .then((profile) => {
        setGuildProfile(profile);
        setGuildProfileError(null);
      })
      .catch((error: Error) => setGuildProfileError(error.message));
  }, [guildSettings.guildOwnerUid, member?.freeFireUid, member?.application?.gameId]);

  useEffect(() => {
    if (!isAuthenticated || !member || !CHAT_ROLES.includes(member.role)) return;
    Promise.all([
      guildApi.list<RankingTask>('ranking-tasks'),
      guildApi.list<RankingScore>('ranking-scores'),
    ]).then(([remoteTasks, remoteScores]) => {
      setRankingTasks(remoteTasks);
      setRankingScores(remoteScores);
      setRankingError(null);
    }).catch(() => {
      setRankingError('Ranking data could not be loaded. Check the second MongoDB connection.');
    });
  }, [isAuthenticated, member]);

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    const socketUrl = backendUrl
      ? `${backendUrl.replace(/^http/, 'ws')}/ws`
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    const socket = new WebSocket(socketUrl);
    chatSocketRef.current = socket;
    socket.onopen = () => {
      while (queuedChatPayloads.current.length > 0) {
        socket.send(queuedChatPayloads.current.shift()!);
      }
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type?: string; title?: string; content?: string; discordId?: string; status?: DiscordPresence; isOnline?: boolean; discordStatus?: string; role?: UserRole; isOwner?: boolean; displayName?: string; discordName?: string; discordDisplayName?: string; discordAvatar?: string; discordBio?: string; bio?: string; totalMembers?: number; onlineMembers?: number; chatMessage?: ChatMessage; messages?: ChatMessage[]; messageId?: string; typingUser?: ChatTypingUser; messageIdList?: string[]; readerId?: string; score?: RankingScore };
      if (message.type === 'guild:stats' && typeof message.totalMembers === 'number' && typeof message.onlineMembers === 'number') {
        setGuildStats({ totalMembers: message.totalMembers, onlineMembers: message.onlineMembers });
        return;
      }
      if (message.type === 'chat:history' && message.messages) {
        setChatMessages(message.messages);
        storeDirectMessages(message.messages);
        return;
      }
      if (message.type === 'device:notification' && message.content) {
        if ('Notification' in window && Notification.permission === 'granted') new Notification(message.title || 'Guild notification', { body: message.content });
      }
      if (message.type === 'chat:message' && message.chatMessage) {
        const currentMember = memberRef.current;
        const isIncomingDm = message.chatMessage.channel === 'dm'
          && message.chatMessage.authorId !== currentMember?.id
          && message.chatMessage.recipientId === currentMember?.id;
        const isIncomingGroupMessage = message.chatMessage.channel === 'group'
          && message.chatMessage.authorId !== currentMember?.id
          && Boolean(currentMember && CHAT_ROLES.includes(currentMember.role));
        if (isIncomingDm || isIncomingGroupMessage) {
          playNotificationSound();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const notification = new Notification(isIncomingGroupMessage ? `New guild message from ${message.chatMessage.authorName}` : `New message from ${message.chatMessage.authorName}`, {
              body: message.chatMessage.content || 'Sent an attachment',
              tag: `guild-dm-${message.chatMessage.id}`,
            });
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }
        }
        setChatMessages((current) => {
          const updated = [...current, message.chatMessage!];
          storeDirectMessages(updated);
          return updated;
        });
        return;
      }
      if (message.type === 'chat:deleted' && message.messageId) {
        setChatMessages((current) => {
          const updated = current.filter((item) => item.id !== message.messageId);
          storeDirectMessages(updated);
          return updated;
        });
        return;
      }
      if (message.type === 'chat:seen' && message.messageIdList && message.readerId) {
        setChatMessages((current) => current.map((item) => message.messageIdList!.includes(item.id) ? { ...item, seenBy: [...new Set([...(item.seenBy || []), message.readerId!])] } : item));
        return;
      }
      if (message.type === 'chat:typing' && message.typingUser) {
        setTypingUsers((current) => message.typingUser!.isTyping === false
          ? current.filter((item) => item.authorId !== message.typingUser!.authorId)
          : [...current.filter((item) => item.authorId !== message.typingUser!.authorId), message.typingUser!]);
        return;
      }
      if (message.type === 'ranking:score' && message.score) {
        setRankingScores((current) => current.some((score) => score.id === message.score!.id) ? current : [message.score!, ...current]);
        return;
      }
      if (!message.discordId) return;
      if (message.type === 'presence' && message.status) {
        latestPresenceRef.current[message.discordId!] = message.status;
        setMembers((current) => current.map((item) => item.discordId === message.discordId ? { ...item, presence: message.status, isOnline: message.isOnline ?? message.status !== 'offline', ...(message.discordStatus !== undefined ? { discordStatus: message.discordStatus } : {}) } : item));
        setMember((current) => {
          if (!current || current.discordId !== message.discordId) return current;
          return { ...current, presence: message.status, isOnline: message.isOnline ?? message.status !== 'offline', ...(message.discordStatus !== undefined ? { discordStatus: message.discordStatus } : {}) };
        });
      }
      if (message.type === 'role' && message.role) {
        setMembers((current) => current.map((item) => item.discordId === message.discordId ? { ...item, role: message.role!, isOwner: message.isOwner, status: message.role === 'recruit' ? item.status : 'approved' } : item));
        setMember((current) => {
          if (!current || current.discordId !== message.discordId) return current;
          return { ...current, role: message.role!, isOwner: message.isOwner, status: message.role === 'recruit' ? current.status : 'approved' };
        });
      }
      if (message.type === 'profile' && message.discordId) {
        setMembers((current) => current.map((item) => item.discordId === message.discordId ? { ...item, ...(message.discordDisplayName ? { discordDisplayName: message.discordDisplayName } : {}), ...(message.discordAvatar ? { discordAvatar: message.discordAvatar } : {}), ...(message.discordName ? { discordName: message.discordName } : {}), ...(message.discordBio ? { discordBio: message.discordBio } : {}) } : item));
        setMember((current) => {
          if (!current || current.discordId !== message.discordId) return current;
          return { ...current, ...(message.discordDisplayName ? { discordDisplayName: message.discordDisplayName } : {}), ...(message.discordAvatar ? { discordAvatar: message.discordAvatar } : {}), ...(message.discordName ? { discordName: message.discordName } : {}), ...(message.discordBio ? { discordBio: message.discordBio } : {}) };
        });
      }
    };
    return () => {
      chatSocketRef.current = null;
      socket.close();
    };
  }, []);

  function readStoredDirectMessages(): ChatMessage[] {
    try {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const messages = JSON.parse(localStorage.getItem('guild-direct-messages') || '[]') as ChatMessage[];
      const recentMessages = messages.filter((message) => Date.parse(message.createdAt) >= cutoff);
      localStorage.setItem('guild-direct-messages', JSON.stringify(recentMessages));
      return recentMessages;
    } catch {
      return [];
    }
  }

  function storeDirectMessages(messages: ChatMessage[]) {
    const directMessages = messages.filter((message) => message.channel === 'dm');
    localStorage.setItem('guild-direct-messages', JSON.stringify(directMessages.slice(-200)));
  }

  const login = () => {
    window.location.assign(`${BACKEND_URL}/auth/discord`);
  };

  const openComposer = (target: ComposerTarget) => setComposerTarget(target);
  const clearComposer = () => setComposerTarget(null);

  useEffect(() => {
    let active = true;
    fetch(`${BACKEND_URL}/api/auth/me`, { credentials: 'include' })
      .then((response) => {
        if (response.status === 401) {
          localStorage.removeItem('guild-auth-member');
          setAuthenticated(false);
          setMember(null);
          setView('landing');
          return null;
        }
        if (!response.ok) throw new Error(`Auth check failed: ${response.status}`);
        return response.json();
      })
      .then((session) => {
        if (!session?.authenticated) return;
        const presence = session.member.isInDiscordGuild === false
          ? 'offline' as DiscordPresence
          : latestPresenceRef.current[session.member.discordId] || session.member.presence;
        const normalizedMember = {
          ...session.member,
          ...(session.member.role === ('elite' as UserRole) ? { role: 'member' as UserRole } : {}),
          ...(presence ? { presence, isOnline: presence !== 'offline' } : {}),
        };
        setMember(normalizedMember);
        localStorage.setItem('guild-auth-member', JSON.stringify(normalizedMember));
        setMembers((current) => [...current.filter((item) => item.id !== normalizedMember.id), normalizedMember]);
        setAuthenticated(true);
        setView(session.member.isInDiscordGuild === false ? 'pending' : 'loading');
      })
      .catch(() => {
        // Keep the cached authenticated shell during short API interruptions or redeploys.
        if (!cachedMember) {
          setAuthenticated(false);
          setMember(null);
          setView('landing');
        }
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);

  const requestAccess = () => {
    if (!member) return;
    const newMember: GuildMember = {
      ...member,
      status: 'pending' as ApprovalStatus,
      role: 'recruit',
    };
    setMember(newMember);
    setMembers((current) => [...current.filter((item) => item.id !== newMember.id), newMember]);
    void guildApi.save('members', newMember).catch(() => undefined);
    setView('pending');
  };

  const submitJoinApplication = (application: JoinApplication) => {
    if (!member) return;
    const newMember = { ...member, status: 'pending' as ApprovalStatus, role: 'recruit' as UserRole, freeFireUid: application.gameId, application };
    setMember(newMember);
    setMembers((current) => [...current.filter((item) => item.id !== newMember.id), newMember]);
    void guildApi.save<GuildMember>('members', newMember).then((savedMember) => {
      setMember(savedMember);
      setMembers((current) => [...current.filter((item) => item.id !== savedMember.id), savedMember]);
    }).catch(() => undefined);
    setView('pending');
  };

  const logout = () => {
    void fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setAuthenticated(false);
    setMember(null);
    localStorage.removeItem('guild-auth-member');
    setView('landing');
  };

  const updateCharacter = (config: CharacterConfig) => {
    if (member) {
      setMember({ ...member, character: config });
    }
  };

  const updateMemberProfile = (changes: { bio?: string; stats?: MemberStats; freeFireUid?: string }) => {
    if (!member) return;
    const updatedMember = { ...member, ...changes };
    setMember(updatedMember);
    setMembers((current) => current.map((item) => item.id === updatedMember.id ? updatedMember : item));
    void guildApi.update<GuildMember>('members', updatedMember.id, changes).catch(() => undefined);
  };

  const saveHlGamingApiKey = async (apiKey: string) => {
    if (!member) throw new Error('You must be signed in to save an HL Gaming API key.');
    await guildApi.saveHlGamingApiKey(member.id, apiKey);
    const updatedMember = { ...member, hasHlGamingApiKey: true };
    setMember(updatedMember);
    setMembers((current) => current.map((item) => item.id === updatedMember.id ? updatedMember : item));
  };

  const sendChatMessage = (content: string, recipientId?: string, attachment?: ChatMessage['attachment']) => {
    const trimmedContent = content.trim();
    if ((!trimmedContent && !attachment) || !member) return;
    if (!recipientId && !CHAT_ROLES.includes(member.role)) return;
    const payload = JSON.stringify({ type: recipientId ? 'chat:dm' : 'chat:send', content: trimmedContent, recipientId, attachment });
    const socket = chatSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(payload);
    else if (socket?.readyState === WebSocket.CONNECTING) queuedChatPayloads.current.push(payload);
  };

  const refreshChatMessages = () => {
    const payload = JSON.stringify({ type: 'chat:refresh' });
    const socket = chatSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(payload);
    else if (socket?.readyState === WebSocket.CONNECTING) queuedChatPayloads.current.push(payload);
  };

  const deleteChatMessage = (id: string) => {
    if (!member || (member.role !== 'admin' && member.role !== 'coadmin')) return;
    setChatMessages((current) => current.filter((item) => item.id !== id));
    const payload = JSON.stringify({ type: 'chat:delete', id });
    const socket = chatSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(payload);
    else if (socket?.readyState === WebSocket.CONNECTING) queuedChatPayloads.current.push(payload);
  };

  const sendChatTyping = (isTyping: boolean, recipientId?: string) => {
    if (!member || !CHAT_ROLES.includes(member.role)) return;
    const payload = JSON.stringify({ type: 'chat:typing', isTyping, recipientId });
    const socket = chatSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(payload);
    else if (socket?.readyState === WebSocket.CONNECTING) queuedChatPayloads.current.push(payload);
  };

  const markChatMessagesSeen = useCallback((messageIds: string[]) => {
    if (!member || messageIds.length === 0) return;
    const payload = JSON.stringify({ type: 'chat:seen', messageIds });
    const socket = chatSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(payload);
    else if (socket?.readyState === WebSocket.CONNECTING) queuedChatPayloads.current.push(payload);
  }, [member]);

  const approveMember = (id: string) => {
    setMembers((current) => current.map((item) => item.id === id ? { ...item, status: 'approved' } : item));
    setMember((current) => current?.id === id ? { ...current, status: 'approved' } : current);
    void guildApi.update<GuildMember>('members', id, { status: 'approved' }).catch(() => undefined);
  };

  const rejectMember = (id: string) => {
    setMembers((current) => current.filter((item) => item.id !== id));
    void guildApi.remove('members', id).catch(() => undefined);
  };

  const suspendMember = async (id: string) => {
    await guildApi.update<GuildMember>('members', id, { status: 'suspended' });
    setMembers((current) => current.map((item) => item.id === id ? { ...item, status: 'suspended' } : item));
  };

  const updateMemberRole = async (id: string, role: UserRole) => {
    await guildApi.update<GuildMember>('members', id, { role });
    setMembers((current) => current.map((item) => item.id === id ? { ...item, role } : item));
    setMember((current) => current?.id === id ? { ...current, role } : current);
  };

  const createMember = (newMember: GuildMember) => {
    setMembers((current) => [newMember, ...current]);
    void guildApi.save('members', newMember).catch(() => undefined);
  };
  const createEvent = (event: GuildEvent) => {
    setEvents((current) => [event, ...current]);
    void guildApi.save('events', event).catch(() => undefined);
  };
  const createAnnouncement = (announcement: Announcement) => {
    setAnnouncements((current) => [announcement, ...current]);
    void guildApi.save('announcements', announcement).catch(() => undefined);
  };
  const updateAnnouncement = (id: string, changes: Partial<Announcement>) => {
    setAnnouncements((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
    void guildApi.update<Announcement>('announcements', id, changes).catch(() => undefined);
  };
  const deleteAnnouncement = (id: string) => {
    setAnnouncements((current) => current.filter((item) => item.id !== id));
    void guildApi.remove('announcements', id).catch(() => undefined);
  };
  const updateGuildSettings = async (settings: GuildSettings) => {
    setGuildSettings(settings);
    await guildApi.save('settings', settings);
    if (settings.guildOwnerUid) {
      try {
        const refreshed = await guildApi.refreshGuildProfile<{
          guildProfile: GuildProfile;
          ownerStats: (Partial<MemberStats> & { freeFireUid?: string }) | null;
          ownerMemberId?: string | null;
        }>();
        setGuildProfile(refreshed.guildProfile);
        const ownerStats = refreshed.ownerStats;
        if (refreshed.ownerMemberId && ownerStats) {
          setMembers((current) => current.map((item) => item.id === refreshed.ownerMemberId
            ? { ...item, freeFireUid: ownerStats.freeFireUid || settings.guildOwnerUid, stats: { ...EMPTY_MEMBER_STATS, ...item.stats, ...ownerStats } }
            : item));
          setMember((current) => {
            if (!current || current.id !== refreshed.ownerMemberId) return current;
            return { ...current, freeFireUid: ownerStats.freeFireUid || settings.guildOwnerUid, stats: { ...EMPTY_MEMBER_STATS, ...current.stats, ...ownerStats } };
          });
        }
      } catch {
      }
    }
  };

  const updateDiscordServerUrl = async (discordServerUrl: string) => {
    const updatedSettings = { ...guildSettings, discordServerUrl };
    await guildApi.update<GuildSettings>('settings', 'guild', { discordServerUrl });
    setGuildSettings(updatedSettings);
  };

  const updateStrongVerification = async (enabled: boolean) => {
    const updatedSettings = { ...guildSettings, strongVerification: enabled };
    await guildApi.update<GuildSettings>('settings', 'guild', { strongVerification: enabled });
    setGuildSettings(updatedSettings);
  };

  const deleteAccount = async () => {
    await guildApi.deleteAccount();
    const deletedMemberId = member?.id;
    localStorage.removeItem('guild-auth-member');
    setMembers((current) => deletedMemberId ? current.filter((item) => item.id !== deletedMemberId) : current);
    setMember(null);
    setAuthenticated(false);
    setView('landing');
  };

  const createRankingTask = (task: RankingTask) => {
    setRankingTasks((current) => [task, ...current]);
    void guildApi.save('ranking-tasks', task).catch(() => setRankingError('Task could not be saved to the ranking database.'));
  };
  const updateRankingTask = (id: string, changes: Partial<RankingTask>) => {
    setRankingTasks((current) => current.map((task) => task.id === id ? { ...task, ...changes } : task));
    void guildApi.update<RankingTask>('ranking-tasks', id, changes).catch(() => setRankingError('Task update could not be saved to the ranking database.'));
  };
  const deleteRankingTask = (id: string) => {
    setRankingTasks((current) => current.filter((task) => task.id !== id));
    void guildApi.remove('ranking-tasks', id).catch(() => setRankingError('Task could not be deleted from the ranking database.'));
  };
  const awardRankingScore = (score: RankingScore) => {
    setRankingScores((current) => [score, ...current]);
    void guildApi.save('ranking-scores', score).catch(() => setRankingError('Points could not be saved to the ranking database.'));
  };
  const unreadChatCount = member
    ? chatMessages.filter((message) => message.authorId !== member.id && !message.seenBy?.includes(member.id)).length
    : 0;

  return (
    <AuthContext.Provider
      value={{
        authLoading,
        isAuthenticated,
        member,
        view,
        login,
        logout,
        setView,
        composerTarget,
        openComposer,
        clearComposer,
        updateCharacter,
        updateMemberProfile,
        saveHlGamingApiKey,
        chatMessages,
        typingUsers,
        sendChatMessage,
        refreshChatMessages,
        sendChatTyping,
        markChatMessagesSeen,
        deleteChatMessage,
        approveMember,
        rejectMember,
        suspendMember,
        updateMemberRole,
        requestAccess,
        submitJoinApplication,
        members,
        events,
        announcements,
        createMember,
        createEvent,
        createAnnouncement,
        updateAnnouncement,
        deleteAnnouncement,
        guildSettings,
        updateGuildSettings,
        updateDiscordServerUrl,
        updateStrongVerification,
        deleteAccount,
        theme,
        setTheme,
        guildStats,
        guildProfile,
        guildProfileError,
        rankingTasks,
        rankingScores,
        rankingError,
        preferences,
        updatePreference,
        notificationPermission,
        requestNotifications,
        previewNotificationSound,
        unreadChatCount,
        createRankingTask,
        updateRankingTask,
        deleteRankingTask,
        awardRankingScore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { mockMembers };
