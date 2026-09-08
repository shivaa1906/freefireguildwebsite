import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { GuildMember, UserRole } from '@/types';
import { guildApi } from '@/lib/api';
import { ROLE_LABELS, ROLE_COLORS } from '@/types';
import { GridBackground, ParticleField, ScanLines, Vignette, AnimatedNumber } from '@/components/effects/VisualEffects';
import { ForbiddenPage } from '@/pages/ErrorPages';
import { Shield, Users, Clock, Ban, UserPlus, Search, Check, X, AlertTriangle, Settings, ChevronLeft, ChevronRight, MessageCircle, Trash2, Save, RotateCcw, KeyRound, RefreshCw, Bell } from 'lucide-react';

type AdminTab = 'overview' | 'pending' | 'members' | 'chat' | 'apiKeys' | 'settings';
type MonitoredKey = { memberId: string; memberName: string; role: string; uid: string; createdAt: string; lastValidatedAt?: string; lastUsedAt?: string; keyStatus: string };
type RoleKey = 'guildLeader' | 'coadmin' | 'moderator' | 'member' | 'members';
type RoleKeySettings = { refreshEveryDays: number; refreshDay: string; refreshTime: string; shareMemberCount: number };
type AutomationChannel = 'auto' | 'discord' | 'website';
type NotificationChannel = 'discord' | 'website' | 'device';
type AutomationSettings = { frequency: 'daily' | 'weekly' | 'custom'; customDays: number; notifications: Record<NotificationChannel, boolean> };
type HlGamingKeyMonitor = {
  config: { maxMemberRefreshesPerKey: number; roleSettings: Record<RoleKey, RoleKeySettings>; automationSettings: Record<string, AutomationSettings> };
  roleKeys: Record<'guildLeader' | 'coadmin' | 'moderator' | 'member', { configured: boolean; key: string | null; source: string }>;
  categories: {
    guildLeader: { configured: boolean; key: string | null; source: string };
    sharedRoles: Array<{ role: string; label: string; configured: boolean; key: string | null; source: string }>;
    personalByRole: Record<'admin' | 'coadmin' | 'moderator' | 'member' | 'other', MonitoredKey[]>;
  };
  keys: MonitoredKey[];
};

export function AdminDashboard() {
  const { member, members, chatMessages, deleteChatMessage, refreshChatMessages, guildSettings, updateGuildSettings, updateDiscordServerUrl, updateStrongVerification, approveMember, rejectMember, suspendMember, updateMemberRole } = useAuth();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [roleUpdateError, setRoleUpdateError] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ type: string; member: GuildMember } | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(guildSettings);
  const [settingsConfirmOpen, setSettingsConfirmOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [discordServerUrlDraft, setDiscordServerUrlDraft] = useState(guildSettings.discordServerUrl || '');
  const [discordLinkSaving, setDiscordLinkSaving] = useState(false);
  const [discordLinkSaved, setDiscordLinkSaved] = useState(false);
  const [discordLinkError, setDiscordLinkError] = useState('');
  const [strongVerificationDraft, setStrongVerificationDraft] = useState(Boolean(guildSettings.strongVerification));
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [chatRefreshing, setChatRefreshing] = useState(false);
  const [keyMonitor, setKeyMonitor] = useState<HlGamingKeyMonitor | null>(null);
  const [keyMonitorError, setKeyMonitorError] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null);
  const [automationDraft, setAutomationDraft] = useState<{ channel: AutomationChannel; role: RoleKey } | null>(null);
  const [automationSettings, setAutomationSettings] = useState<Record<string, AutomationSettings>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem('hl-gaming-auto-reminder-settings') || '{}') as Record<string, AutomationSettings>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!chatRefreshing) return;
    const timeout = window.setTimeout(() => setChatRefreshing(false), 1000);
    return () => window.clearTimeout(timeout);
  }, [chatMessages, chatRefreshing]);

  const handleChatRefresh = () => {
    if (chatRefreshing) return;
    setChatRefreshing(true);
    refreshChatMessages();
  };
  const [automationSaveState, setAutomationSaveState] = useState<'idle' | 'success' | 'failed'>('idle');
  const [reminderMemberId, setReminderMemberId] = useState<string | null>(null);
  const [reminderStatus, setReminderStatus] = useState<Record<string, 'success' | 'failed'>>({});
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);

  useEffect(() => setSettingsDraft(guildSettings), [guildSettings]);
  useEffect(() => setDiscordServerUrlDraft(guildSettings.discordServerUrl || ''), [guildSettings.discordServerUrl]);
  useEffect(() => {
    if (!roleUpdateError) return;
    const timeout = window.setTimeout(() => setRoleUpdateError(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [roleUpdateError]);
  useEffect(() => setStrongVerificationDraft(Boolean(guildSettings.strongVerification)), [guildSettings.strongVerification]);

  useEffect(() => {
    if (automationSaveState !== 'success') return;
    if (automationDraft?.channel === 'auto') {
      const role = automationDraft.role;
      const settings = automationSettings[`auto:${role}`];
      if (settings) void saveAutomationSettings(role, settings).catch(() => setAutomationSaveState('failed'));
    }
    const timeout = window.setTimeout(() => setAutomationSaveState('idle'), 3000);
    return () => window.clearTimeout(timeout);
  }, [automationSaveState, automationDraft, automationSettings]);

  useEffect(() => {
    if (Object.keys(reminderStatus).length === 0) return;
    const timeout = window.setTimeout(() => setReminderStatus({}), 3000);
    return () => window.clearTimeout(timeout);
  }, [reminderStatus]);

  useEffect(() => {
    if (!selectedRole) return;
    const notifications = automationSettings[`auto:${selectedRole}`]?.notifications || { discord: true, website: false, device: true };
    window.localStorage.setItem('hl-gaming-auto-reminder-notifications', JSON.stringify(notifications));
  }, [automationSettings, selectedRole]);

  useEffect(() => {
    window.localStorage.setItem('hl-gaming-auto-reminder-settings', JSON.stringify(automationSettings));
  }, [automationSettings]);

  useEffect(() => {
    if (tab !== 'apiKeys') return;
    void guildApi.adminHlGamingKeys<HlGamingKeyMonitor>().then((data) => {
      if (!data) return;
      setKeyMonitor(data);
      setAutomationSettings((current) => ({ ...current, ...Object.fromEntries(Object.entries(data.config.automationSettings || {}).map(([role, settings]) => [`auto:${role}`, settings])) }));
    }).catch((error: Error) => setKeyMonitorError(error.message));
  }, [tab]);

  const updateTabScrollState = () => {
    const tabsElement = tabsRef.current;
    if (!tabsElement) return;
    setCanScrollTabsLeft(tabsElement.scrollLeft > 4);
    setCanScrollTabsRight(tabsElement.scrollLeft + tabsElement.clientWidth < tabsElement.scrollWidth - 4);
  };

  useEffect(() => {
    updateTabScrollState();
    window.addEventListener('resize', updateTabScrollState);
    return () => window.removeEventListener('resize', updateTabScrollState);
  }, []);

  const scrollTabs = (distance: number) => tabsRef.current?.scrollBy({ left: distance, behavior: 'smooth' });

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError(false);
    try {
      await updateGuildSettings(settingsDraft);
      setSettingsConfirmOpen(false);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch {
      setSettingsSaved(false);
      setSettingsError(true);
    } finally {
      setSettingsSaving(false);
    }
  };

  const resetSettings = () => {
    setSettingsDraft(guildSettings);
    setSettingsConfirmOpen(false);
    setSettingsError(false);
  };

  const saveDiscordServerUrl = async () => {
    setDiscordLinkSaving(true);
    setDiscordLinkSaved(false);
    setDiscordLinkError('');
    try {
      await updateDiscordServerUrl(discordServerUrlDraft.trim());
      setDiscordLinkSaved(true);
      window.setTimeout(() => setDiscordLinkSaved(false), 2500);
    } catch (error) {
      setDiscordLinkError(error instanceof Error ? error.message : 'Discord link could not be saved.');
    } finally {
      setDiscordLinkSaving(false);
    }
  };

  const saveStrongVerification = async (enabled: boolean) => {
    setVerificationSaving(true);
    setVerificationError('');
    try {
      await updateStrongVerification(enabled);
    } catch (error) {
      setStrongVerificationDraft(!enabled);
      setVerificationError(error instanceof Error ? error.message : 'Verification setting could not be saved.');
    } finally {
      setVerificationSaving(false);
    }
  };

  const canManage = member?.role === 'admin' || member?.role === 'coadmin';
  const isOwner = member?.role === 'admin' && member.isOwner !== false;
  const canMonitorChat = member?.role === 'admin' || member?.role === 'coadmin';
  if (!canManage) {
    return <ForbiddenPage />;
  }

  const pendingMembers = members.filter((m) => m.status === 'pending' && Boolean(m.application));
  const approvedMembers = members.filter((m) => m.status === 'approved');
  const suspendedMembers = members.filter((m) => m.status === 'suspended');
  const guildMemberRoles: UserRole[] = ['admin', 'coadmin', 'moderator', 'member'];
  const recentJoins = approvedMembers
    .filter((m) => guildMemberRoles.includes(m.role))
    .sort((a, b) => b.joinDate.localeCompare(a.joinDate))
    .slice(0, 3);
  const privateMessages = chatMessages.filter((message) => message.channel === 'dm');
  const privateConversations = Array.from(privateMessages.reduce((groups, message) => {
    const key = [message.authorId, message.recipientId || ''].sort().join(':');
    groups.set(key, [...(groups.get(key) || []), message]);
    return groups;
  }, new Map<string, typeof privateMessages>()).entries());
  const roleLabels: Record<RoleKey, string> = { guildLeader: 'Guild Leader', coadmin: 'Acting Leader', moderator: 'Elder', member: 'Guild Member', members: 'Non Guild Members' };
  const websiteRoleKeys = keyMonitor?.roleKeys || {
    guildLeader: { configured: false, key: null, source: 'Website-managed encrypted key' },
    coadmin: { configured: false, key: null, source: 'Website-managed encrypted key' },
    moderator: { configured: false, key: null, source: 'Website-managed encrypted key' },
    member: { configured: false, key: null, source: 'Website-managed encrypted key' },
  };
  const roleCards: Array<{ role: RoleKey; label: string; key: string | null; configured: boolean; source: string }> = [
    { role: 'guildLeader', label: roleLabels.guildLeader, key: websiteRoleKeys.guildLeader.key || null, configured: Boolean(websiteRoleKeys.guildLeader.configured), source: 'Website-managed encrypted key' },
    ...(['coadmin', 'moderator'] as const).map((role) => {
      const websiteKey = websiteRoleKeys[role];
      return { role, label: roleLabels[role], key: websiteKey?.key || null, configured: Boolean(websiteKey?.configured), source: 'Website-managed encrypted key' };
    }),
    { role: 'member', label: roleLabels.member, key: websiteRoleKeys.member.key || null, configured: Boolean(websiteRoleKeys.member.configured), source: 'Website-managed encrypted key' },
  ];
  const getRoleUsers = (role: RoleKey) => role === 'members'
    ? members.filter((guildMember) => !['admin', 'coadmin', 'moderator', 'member'].includes(guildMember.role))
    : approvedMembers.filter((guildMember) => guildMember.role === (role === 'guildLeader' ? 'admin' : role));
  const getRoleCounts = (role: RoleKey) => {
    const roleUsers = getRoleUsers(role);
    const added = roleUsers.filter((guildMember) => keyMonitor?.keys.some((key) => key.memberId === guildMember.id)).length;
    return { total: roleUsers.length, added, notAdded: roleUsers.length - added };
  };

  const saveKeyConfig = (roleSettings: Record<RoleKey, RoleKeySettings>, limit = keyMonitor?.config.maxMemberRefreshesPerKey || 10) => {
    void guildApi.updateHlGamingConfig({ maxMemberRefreshesPerKey: limit, roleSettings, automationSettings: keyMonitor?.config.automationSettings || {} }).then((config) => setKeyMonitor((current) => current ? { ...current, config } : current)).catch((error: Error) => setKeyMonitorError(error.message));
  };

  const saveAutomationSettings = async (role: RoleKey, settings: AutomationSettings) => {
    if (!keyMonitor) return;
    const storageRole = role === 'members' ? 'member' : role;
    const automationSettings = { ...keyMonitor.config.automationSettings, [storageRole]: settings };
    const config = await guildApi.updateHlGamingConfig({ maxMemberRefreshesPerKey: keyMonitor.config.maxMemberRefreshesPerKey, roleSettings: keyMonitor.config.roleSettings, automationSettings });
    setKeyMonitor((current) => current ? { ...current, config } : current);
  };

    const filteredMembers = members.filter((m) => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (m.status !== 'approved' && !isNonGuildMember(m)) return false;
    if (search && !m.displayName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleRoleChange = async (id: string, role: UserRole) => {
    setRoleUpdateError('');
    try {
      await updateMemberRole(id, role);
    } catch (error) {
      setRoleUpdateError(error instanceof Error ? error.message : 'Role could not be updated.');
    }
  };

  const tabs: { id: AdminTab; label: string; icon: typeof Shield; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Shield },
    { id: 'pending', label: 'Pending', icon: Clock, badge: pendingMembers.length },
    { id: 'members', label: 'Members', icon: Users },
    ...(canMonitorChat ? [{ id: 'chat' as AdminTab, label: 'Chat Monitor', icon: MessageCircle }] : []),
    { id: 'apiKeys', label: 'API Key Monitor', icon: KeyRound },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className={`min-h-screen bg-ink-900 relative overflow-hidden pt-16 ${automationSaveState === 'success' ? 'auto-reminder-saved' : ''}`}>
      <GridBackground />
      <ParticleField count={30} />
      <ScanLines />
      <Vignette />

      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 animate-fade-in-down">
            <div className="hud-label mb-1">ADMIN COMMAND CENTER · RESTRICTED ACCESS</div>
            <h1 className="section-title text-3xl md:text-4xl">Command Center</h1>
          </div>

          {/* Tabs */}
          <div className="relative mb-8 animate-fade-in-up">
            {canScrollTabsLeft && <button onClick={() => scrollTabs(-220)} className="absolute left-0 top-1/2 z-10 -translate-y-1/2 p-1.5 bg-ink-800/95 border border-neon-500/40 text-neon-300 shadow-lg" aria-label="Scroll admin tabs left"><ChevronLeft size={16} /></button>}
            <div ref={tabsRef} onScroll={updateTabScrollState} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); requestAnimationFrame(() => document.getElementById(`admin-tab-${t.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })); }}
                  id={`admin-tab-${t.id}`}
                  className={`relative flex items-center gap-2 px-4 py-3 font-heading font-semibold text-sm uppercase tracking-wider whitespace-nowrap transition-all clip-tactical ${
                    tab === t.id
                      ? 'bg-neon-500/15 text-neon-300 border border-neon-500/40'
                      : 'text-gray-500 border border-tactical-700/30 hover:text-tactical-200'
                  }`}
                >
                  <Icon size={16} />
                  <span>{t.label}</span>
                  {t.badge !== undefined && t.badge > 0 && (
                    <span className="px-1.5 py-0.5 bg-alert-500 text-white font-mono text-[10px] rounded-full">
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
            </div>
            {canScrollTabsRight && <button onClick={() => scrollTabs(220)} className="absolute right-0 top-1/2 z-10 -translate-y-1/2 p-1.5 bg-ink-800/95 border border-neon-500/40 text-neon-300 shadow-lg" aria-label="Scroll admin tabs right"><ChevronRight size={16} /></button>}
          </div>

          {/* Overview */}
          {tab === 'overview' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: Users, label: 'Approved Members', value: approvedMembers.length, color: 'text-success-400' },
                  { icon: Clock, label: 'Pending Requests', value: pendingMembers.length, color: 'text-warning-400' },
                  { icon: Ban, label: 'Suspended', value: suspendedMembers.length, color: 'text-alert-400' },
                  { icon: UserPlus, label: 'Recent Joins', value: recentJoins.length, color: 'text-neon-400' },
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div key={i} className="tactical-card p-5 corner-brackets">
                      <div className="flex items-center justify-between mb-3">
                        <Icon size={24} className={stat.color} />
                      </div>
                      <div className="font-display font-black text-3xl text-white">
                        <AnimatedNumber value={stat.value} />
                      </div>
                      <div className="font-mono text-xs text-gray-500 uppercase tracking-wider mt-1">{stat.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Recent activity */}
              <div className="glass-panel clip-tactical p-6">
                <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {recentJoins.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-3 bg-ink-800/30 border border-ink-600">
                      <img src={m.avatar} alt={m.displayName} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.displayName)}&background=f5a623&color=111827&size=200`; }} className="w-8 h-8 rounded-full object-cover border border-ink-600" />
                      <div className="flex-1">
                        <div className="font-heading font-semibold text-sm text-white">{m.displayName}</div>
                        <div className="font-mono text-xs text-gray-500">Joined {m.joinDate}</div>
                      </div>
                      <div className={`font-mono text-xs uppercase ${ROLE_COLORS[m.role]}`}>{ROLE_LABELS[m.role]}</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* Pending requests */}
          {tab === 'pending' && (
            <div className="space-y-4 animate-fade-in-up">
              {pendingMembers.length === 0 && (
                <div className="text-center py-20">
                  <Check size={48} className="text-success-500 mx-auto mb-4" />
                  <div className="font-mono text-sm text-gray-500">NO PENDING REQUESTS</div>
                </div>
              )}
              {pendingMembers.map((m) => (
                <div key={m.id} className="tactical-card p-5 flex items-center gap-4 flex-wrap">
                  <img src={m.avatar} alt={m.displayName} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.displayName)}&background=f5a623&color=111827&size=200`; }} className="w-12 h-12 rounded-full object-cover border border-neon-500/30" />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-lg text-white">{m.displayName}</div>
                    <div className="font-mono text-xs text-gray-500">{m.discordName}</div>
                    <div className="font-mono text-xs text-tactical-300 mt-1">Requested: {m.joinDate}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmAction({ type: 'approve', member: m })}
                      className="px-4 py-2 bg-success-500/15 border border-success-500/40 text-success-400 font-heading font-semibold text-xs uppercase tracking-wider hover:bg-success-500/25 transition-all clip-tactical flex items-center gap-1"
                    >
                      <Check size={14} /> Approve
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: 'reject', member: m })}
                      className="px-4 py-2 bg-alert-500/15 border border-alert-500/40 text-alert-400 font-heading font-semibold text-xs uppercase tracking-wider hover:bg-alert-500/25 transition-all clip-tactical flex items-center gap-1"
                    >
                      <X size={14} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Members management */}
          {tab === 'members' && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search members..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-ink-700/50 border border-tactical-700/40 text-white font-heading placeholder-gray-500 focus:border-neon-500/50 focus:outline-none transition-colors clip-tactical"
                  />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {(['all', 'admin', 'coadmin', 'moderator', 'member', 'recruit'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRoleFilter(r)}
                      className={`px-3 py-2 font-heading font-semibold text-xs uppercase tracking-wider whitespace-nowrap transition-all clip-tactical ${
                        roleFilter === r
                          ? 'bg-neon-500/20 text-neon-300 border border-neon-500/40'
                          : 'text-gray-500 border border-tactical-700/30 hover:text-tactical-200'
                      }`}
                    >
                      {r === 'all' ? 'All' : ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
              {roleUpdateError && <div className="border border-alert-500/40 bg-alert-500/10 px-4 py-3 font-mono text-xs uppercase text-alert-400">{roleUpdateError}</div>}

              <div className="space-y-2">
                {filteredMembers.map((m) => (
                  <div key={m.id} className="tactical-card p-4 flex items-center gap-4 flex-wrap">
                    <img src={m.avatar} alt={m.displayName} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.displayName)}&background=f5a623&color=111827&size=200`; }} className="w-10 h-10 rounded-full object-cover border border-ink-600" />
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-semibold text-white">{m.displayName}</div>
                      <div className="font-mono text-xs text-gray-500">{m.discordName}</div>
                    </div>
                    {isOwner && !m.isOwner && <select
                      value={m.role}
                      onChange={(event) => void handleRoleChange(m.id, event.target.value as UserRole)}
                      className="px-3 py-2 bg-ink-800/50 border border-tactical-700/40 text-tactical-200 font-heading text-xs uppercase tracking-wider focus:border-neon-500/50 focus:outline-none clip-tactical"
                    >
                      {(['admin', 'coadmin', 'moderator', 'member', 'recruit'] as UserRole[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>}
                    {!isOwner && <span className="font-mono text-[10px] text-gray-600 uppercase">Owner manages roles</span>}
                    <div className={`font-mono text-xs uppercase ${ROLE_COLORS[m.role]}`}>{ROLE_LABELS[m.role]}</div>
                    <button
                      onClick={() => setConfirmAction({ type: 'suspend', member: m })}
                      className="px-3 py-2 bg-alert-500/10 border border-alert-500/30 text-alert-400 font-heading font-semibold text-xs uppercase hover:bg-alert-500/20 transition-all clip-tactical"
                    >
                      <Ban size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Private chat monitoring */}
          {tab === 'chat' && canMonitorChat && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="glass-panel clip-tactical p-6">
                <div className="flex items-center gap-3 mb-2">
                  <MessageCircle size={20} className="text-neon-400" />
                  <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Private DM Monitor</h3><button onClick={handleChatRefresh} disabled={chatRefreshing} className="btn-outline ml-auto inline-flex items-center gap-2 disabled:cursor-wait disabled:opacity-60" aria-label={chatRefreshing ? 'Refreshing private messages' : 'Refresh private messages'}><RefreshCw size={14} className={chatRefreshing ? 'animate-spin' : ''} /> {chatRefreshing ? 'Refreshing' : 'Refresh'}</button>
                </div>
                <p className="font-mono text-xs text-tactical-300 uppercase">Guild Leader and Acting Leader oversight · {privateConversations.length} conversations · {privateMessages.length} messages</p>
              </div>
              {privateConversations.length === 0 && (
                <div className="text-center py-20 font-mono text-sm text-gray-500 uppercase">No private messages yet</div>
              )}
              {selectedConversationKey ? (() => {
                const conversation = privateConversations.find(([key]) => key === selectedConversationKey)?.[1] || [];
                const firstMessage = conversation[0];
                const firstName = members.find((item) => item.id === firstMessage?.authorId)?.displayName || firstMessage?.authorName || 'Guild member';
                const secondName = members.find((item) => item.id === firstMessage?.recipientId)?.displayName || 'Guild member';
                return <div className="space-y-3"><button onClick={() => setSelectedConversationKey(null)} className="btn-outline inline-flex items-center gap-2"><ChevronLeft size={15} /> Back to conversations</button><div className="hud-label">{firstName} ↔ {secondName} · {conversation.length} messages</div>{conversation.map((message) => <div key={message.id} className="tactical-card p-4 flex items-start gap-4"><div className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-neon-500/15 border border-neon-500/30 font-heading font-bold text-neon-300">{message.authorName.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap font-heading font-bold text-white"><span>{message.authorName}</span><span className="text-gray-600">to</span><span>{members.find((item) => item.id === message.recipientId)?.displayName || 'Guild member'}</span><span className="font-mono text-[10px] text-gray-500">{new Date(message.createdAt).toLocaleString()}</span></div><p className="mt-2 text-gray-300 font-heading text-sm break-words">{message.content}</p></div><button onClick={() => deleteChatMessage(message.id)} className="p-2 text-gray-600 hover:text-alert-400" title="Delete private message" aria-label="Delete private message"><Trash2 size={16} /></button></div>)}</div>;
              })() : privateConversations.map(([conversationKey, conversation]) => {
                const firstMessage = conversation[0];
                const firstName = members.find((item) => item.id === firstMessage.authorId)?.displayName || firstMessage.authorName;
                const secondName = members.find((item) => item.id === firstMessage.recipientId)?.displayName || 'Guild member';
                const latestMessage = conversation[conversation.length - 1];
                return <button key={conversationKey} onClick={() => setSelectedConversationKey(conversationKey)} className="tactical-card w-full p-4 flex items-start gap-4 text-left hover:border-neon-500/50"><div className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-neon-500/15 border border-neon-500/30 font-heading font-bold text-neon-300">{firstName.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap font-heading font-bold text-white"><span>{firstName}</span><span className="text-gray-600">↔</span><span>{secondName}</span><span className="font-mono text-[10px] text-gray-500">{conversation.length} messages · {new Date(latestMessage.createdAt).toLocaleString()}</span></div><p className="mt-2 text-gray-300 font-heading text-sm truncate">{latestMessage.content}</p></div><ChevronRight size={18} className="text-neon-400 mt-2" /></button>;
              })}
            </div>
          )}

          {/* Settings */}
          {tab === 'settings' && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="glass-panel clip-tactical p-6">
                <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4">Guild Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="font-mono text-xs text-gray-500 uppercase tracking-widest block mb-1">Guild Name</label>
                    <input type="text" value={settingsDraft.name} onChange={(event) => setSettingsDraft({ ...settingsDraft, name: event.target.value })} className="w-full px-4 py-3 bg-ink-800/50 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none clip-tactical" />
                  </div>
                  <div>
                    <label className="font-mono text-xs text-gray-500 uppercase tracking-widest block mb-1">Guild Description</label>
                    <textarea value={settingsDraft.description} onChange={(event) => setSettingsDraft({ ...settingsDraft, description: event.target.value })} rows={3} className="w-full px-4 py-3 bg-ink-800/50 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none clip-tactical resize-none" />
                  </div>
                  <div>
                    <label className="font-mono text-xs text-gray-500 uppercase tracking-widest block mb-1">Guild Owner Free Fire UID</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]{5,15}" value={settingsDraft.guildOwnerUid || ''} onChange={(event) => setSettingsDraft({ ...settingsDraft, guildOwnerUid: event.target.value.replace(/\D/g, '') })} placeholder="Enter the UID used for guild lookups" className="w-full px-4 py-3 bg-ink-800/50 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none clip-tactical" />
                    <p className="mt-1 font-mono text-[10px] text-gray-500">HL Gaming uses this UID to refresh the owner account and guild profile weekly.</p>
                  </div>
                  <button onClick={() => setSettingsConfirmOpen(true)} disabled={settingsSaving} className="btn-neon inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"><Save size={16} /> Save Settings</button>
                  {settingsSaved && <span className="ml-3 font-mono text-xs text-success-400">SETTINGS SAVED</span>}
                  {settingsError && <span className="ml-3 font-mono text-xs text-alert-400">SETTINGS NOT SAVED</span>}
                </div>
              </div>
              <div className="glass-panel clip-tactical p-6">
                <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-2">Discord Server Link</h3>
                <p className="font-mono text-xs text-gray-500 mb-4">This link is stored separately and stays active across the website until you save a replacement.</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input type="url" value={discordServerUrlDraft} onChange={(event) => setDiscordServerUrlDraft(event.target.value)} placeholder="https://discord.gg/your-invite" className="flex-1 px-4 py-3 bg-ink-800/50 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none clip-tactical" />
                  <button onClick={() => void saveDiscordServerUrl()} disabled={discordLinkSaving} className="btn-neon inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"><Save size={16} /> {discordLinkSaving ? 'Saving...' : 'Save Link'}</button>
                </div>
                {discordLinkSaved && <div className="mt-2 font-mono text-xs text-success-400">DISCORD LINK SAVED</div>}
                {discordLinkError && <div className="mt-2 font-mono text-xs text-alert-400">{discordLinkError}</div>}
              </div>
              <div className="glass-panel clip-tactical p-6">
                <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-2">Free Fire Verification</h3>
                <p className="font-mono text-xs text-gray-500 mb-4">This verification mode is stored separately and changes only after the Guild Leader saves it.</p>
                <div className={`flex items-start justify-between gap-3 p-4 border ${isOwner ? 'border-neon-500/30' : 'border-tactical-700/30 opacity-60'}`}>
                  <button type="button" aria-pressed={strongVerificationDraft} aria-label="Toggle stronger Free Fire verification" disabled={!isOwner || verificationSaving} onClick={() => { const enabled = !strongVerificationDraft; setStrongVerificationDraft(enabled); void saveStrongVerification(enabled); }} className={`order-2 relative self-center h-7 w-14 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${strongVerificationDraft ? 'bg-[#f5a623]' : 'bg-[#5b5b5b]'}`}>
                    <span className="absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white transition-transform duration-200" style={{ transform: `translate(${strongVerificationDraft ? '28px' : '0px'}, -50%)` }} />
                  </button>
                  <span>
                    <span className="block font-heading font-semibold text-white">Stronger Free Fire verification</span>
                    <span className="block mt-1 font-mono text-xs text-gray-500">ON requires a profile code and screenshot for manual ownership review. OFF uses the recommended UID application flow.</span>
                    {!isOwner && <span className="block mt-1 font-mono text-[10px] text-warning-400 uppercase">Guild Leader only</span>}
                  </span>
                </div>
                {verificationSaving && <div className="mt-2 font-mono text-xs text-tactical-300">SAVING VERIFICATION SETTING...</div>}
                {verificationError && <div className="mt-2 font-mono text-xs text-alert-400">{verificationError}</div>}
              </div>
            </div>
          )}
          {tab === 'apiKeys' && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="glass-panel clip-tactical p-6">
                <div className="flex items-center gap-3 mb-2">
                  <KeyRound size={20} className="text-neon-400" />
                  <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">HL Gaming Key Monitor</h3>
                </div>
                <p className="font-mono text-xs text-gray-500 mb-5">Keys are masked in this panel. Open a role to edit its refresh schedule and sharing rules.</p>
                {keyMonitorError && <p className="mb-4 font-mono text-xs text-alert-400">{keyMonitorError}</p>}
                {!keyMonitor && <p className="font-mono text-xs text-gray-500">Loading key records...</p>}
                {keyMonitor && <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="p-4 bg-ink-800/30 border border-ink-600">
                      <div className="font-heading font-bold text-white uppercase tracking-wider">ENV Guild Leader API Key</div>
                      <div className="font-mono text-[10px] text-gray-500 mt-2">{keyMonitor.categories.guildLeader.source}</div>
                      <div className={`font-mono text-xs uppercase mt-3 ${keyMonitor.categories.guildLeader.configured ? 'text-success-400' : 'text-alert-400'}`}>{keyMonitor.categories.guildLeader.configured ? 'Configured' : 'Not configured'}</div>
                    </div>
                    <div className="p-4 bg-ink-800/30 border border-ink-600">
                      <div className="font-heading font-bold text-white uppercase tracking-wider">ENV Guild Members API Key</div>
                      <div className="space-y-2 mt-2">{keyMonitor.categories.sharedRoles.map((item) => <div key={item.source} className="flex items-center justify-between gap-3 font-mono text-[10px]"><span className="text-gray-500">{item.source}</span><span className={item.configured ? 'text-success-400' : 'text-alert-400'}>{item.configured ? 'Configured' : 'Not configured'}</span></div>)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="hud-label mb-2">ROLE KEY SETTINGS</div>
                    <div className="space-y-2">
                    {roleCards.map((role) => (
                      <button key={role.role} onClick={() => setSelectedRole(role.role)} className="w-full p-4 text-left border clip-tactical transition-all border-ink-600 bg-ink-800/30 hover:border-neon-500/50 hover:bg-neon-500/5">
                        <span className="block font-heading font-semibold text-white">{role.label}</span><span className="font-mono text-[10px] uppercase"><span className="text-white">TOTAL {getRoleCounts(role.role).total}</span><span className="text-gray-500"> · </span><span className="text-success-400">ADDED {getRoleCounts(role.role).added}</span><span className="text-gray-500"> · </span><span className="text-alert-400">NOT ADDED {getRoleCounts(role.role).notAdded}</span></span>
                      </button>
                    ))}
                      <button onClick={() => setSelectedRole('members')} className="w-full p-4 text-left border clip-tactical border-ink-600 bg-ink-800/30 hover:border-neon-500/50 hover:bg-neon-500/5">
                        <span className="block font-heading font-semibold text-white">Non Guild Members</span>
                        <span className="font-mono text-[10px] uppercase"><span className="text-white">TOTAL {getRoleCounts('members').total}</span><span className="text-gray-500"> · </span><span className="text-success-400">ADDED {getRoleCounts('members').added}</span><span className="text-gray-500"> · </span><span className="text-alert-400">NOT ADDED {getRoleCounts('members').notAdded}</span></span>
                      </button>
                    </div>
                  </div>
                  {selectedRole && (() => {
                    const role = selectedRole === 'members' ? { role: 'members' as const, label: 'Non Guild Members', key: websiteRoleKeys.member.key, configured: websiteRoleKeys.member.configured, source: 'Website-managed encrypted key' } : roleCards.find((item) => item.role === selectedRole)!;
                    const roleConfigKey = selectedRole === 'members' ? 'member' : selectedRole;
                    const settings = keyMonitor.config.roleSettings[roleConfigKey];
                    const memberRole = selectedRole === 'guildLeader' ? 'admin' : selectedRole === 'members' ? 'member' : selectedRole;
                    const usersInRole = selectedRole === 'members'
                      ? members.filter((guildMember) => !['admin', 'coadmin', 'moderator', 'member'].includes(guildMember.role))
                      : approvedMembers.filter((guildMember) => guildMember.role === memberRole);
                    const usersWithKey = usersInRole.filter((guildMember) => keyMonitor.keys.some((key) => key.memberId === guildMember.id));
                    const usersWithoutKey = usersInRole.filter((guildMember) => !keyMonitor.keys.some((key) => key.memberId === guildMember.id));
                    return <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-900/95 backdrop-blur-md">
                      <div className="min-h-screen px-4 py-6 md:px-10 md:py-10"><div className="mx-auto max-w-5xl">
                        <div className="flex justify-end mb-8"><button onClick={() => setSelectedRole(null)} className="btn-outline inline-flex items-center gap-2">Back</button></div>
                        <div className="border border-neon-500/30 bg-ink-800/40 p-5 md:p-8 space-y-6">
                          <div><div className="hud-label mb-2">ROLE DETAILS</div><div className="font-display font-bold text-2xl text-white uppercase tracking-wider">{role.label}</div><div className="font-mono text-xs text-gray-500 mt-2">WEBSITE KEY · {role.key || 'Not configured'}</div></div>
                          <div className="flex items-center gap-2 font-mono text-xs uppercase"><span className={role.configured ? 'text-success-400' : 'text-alert-400'}>{role.configured ? 'Website key is configured' : 'Website key is not configured'}</span></div>
                          {role.configured && <button onClick={() => { void guildApi.removeHlGamingRoleKey(selectedRole).then(() => setKeyMonitor((current) => current ? { ...current, roleKeys: { ...current.roleKeys, [selectedRole]: { configured: false, key: null, source: 'Website-managed encrypted key' } } } : current)).catch((error: Error) => setKeyMonitorError(error.message)); }} className="btn-outline text-alert-300 border-alert-500/30">Remove website key</button>}
                          <div className="grid gap-4 sm:grid-cols-3">
                            <label><span className="hud-label block mb-1">Refresh every (days)</span><input type="number" min="1" max="365" value={settings.refreshEveryDays} onChange={(event) => setKeyMonitor({ ...keyMonitor, config: { ...keyMonitor.config, roleSettings: { ...keyMonitor.config.roleSettings, [selectedRole]: { ...settings, refreshEveryDays: Number(event.target.value) } } } })} className="w-full px-3 py-3 bg-ink-900/60 border border-tactical-700/40 text-white font-mono focus:border-neon-500/50 focus:outline-none" /></label>
                            <label><span className="hud-label block mb-1">Refresh day</span><select value={settings.refreshDay} onChange={(event) => setKeyMonitor({ ...keyMonitor, config: { ...keyMonitor.config, roleSettings: { ...keyMonitor.config.roleSettings, [selectedRole]: { ...settings, refreshDay: event.target.value } } } })} className="w-full px-3 py-3 bg-ink-900/60 border border-tactical-700/40 text-white font-mono focus:border-neon-500/50 focus:outline-none">{['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
                            <label><span className="hud-label block mb-1">Refresh time</span><input type="time" value={settings.refreshTime} onChange={(event) => setKeyMonitor({ ...keyMonitor, config: { ...keyMonitor.config, roleSettings: { ...keyMonitor.config.roleSettings, [selectedRole]: { ...settings, refreshTime: event.target.value } } } })} className="w-full px-3 py-3 bg-ink-900/60 border border-tactical-700/40 text-white font-mono focus:border-neon-500/50 focus:outline-none" /></label>
                          </div>
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-end"><label className="flex-1"><span className="hud-label block mb-1">Share this key for members</span><input type="number" min="1" max="100" value={settings.shareMemberCount} onChange={(event) => setKeyMonitor({ ...keyMonitor, config: { ...keyMonitor.config, roleSettings: { ...keyMonitor.config.roleSettings, [roleConfigKey]: { ...settings, shareMemberCount: Number(event.target.value) } } } })} className="w-full px-3 py-3 bg-ink-900/60 border border-tactical-700/40 text-white font-mono focus:border-neon-500/50 focus:outline-none" /></label><button onClick={() => saveKeyConfig(keyMonitor.config.roleSettings)} className="btn-neon inline-flex items-center justify-center gap-2"><RefreshCw size={15} /> Save role settings</button></div>
                          <div className="flex flex-wrap gap-3 border-t border-ink-600/70 pt-5"><button onClick={() => setAutomationDraft({ channel: 'auto', role: selectedRole })} className="btn-outline inline-flex items-center gap-2">Auto Reminder</button></div>
                          <div className="border-t border-ink-600/70 pt-5"><div className="flex items-center justify-between mb-4"><div className="hud-label">USERS IN THIS ROLE</div><div className="font-mono text-xs text-white">TOTAL MEMBERS: {usersInRole.length}</div></div>{usersInRole.length === 0 ? <p className="font-mono text-xs text-gray-600">No users assigned to this role.</p> : <div className="space-y-5"><div><div className="font-mono text-[10px] uppercase text-success-400 mb-2">API KEY ADDED · {usersWithKey.length}</div><div className="space-y-2">{usersWithKey.length === 0 ? <p className="font-mono text-xs text-gray-600">No members with an API key.</p> : usersWithKey.map((guildMember) => <div key={guildMember.id} className="p-3 bg-ink-900/40 border border-success-500/20"><div className="font-heading font-semibold text-white">{guildMember.displayName}</div><div className="font-mono text-[10px] uppercase mt-1 text-success-400">API key configured</div></div>)}</div></div><div><div className="font-mono text-[10px] uppercase text-alert-400 mb-2">API KEY NOT ADDED · {usersWithoutKey.length}</div>{keyMonitorError && <p className="font-mono text-[10px] text-alert-400 mb-2">{keyMonitorError}</p>}<div className="space-y-2">{usersWithoutKey.length === 0 ? <p className="font-mono text-xs text-gray-600">All members have an API key.</p> : usersWithoutKey.map((guildMember) => <div key={guildMember.id} className="flex items-center gap-3 p-3 bg-ink-800/30 border border-alert-500/20"><div className="flex-1"><div className="font-heading font-semibold text-white">{guildMember.displayName}</div><div className="font-mono text-[10px] uppercase mt-1 text-alert-400">API key not configured</div></div><button onClick={() => { setReminderMemberId(guildMember.id); void guildApi.sendHlGamingKeyReminder(guildMember.id).then((result) => { setReminderStatus((current) => ({ ...current, [guildMember.id]: result.discordSent ? 'success' : 'failed' })); if (!result.discordSent) setKeyMonitorError(result.discordError || 'Discord DM could not be delivered.'); }).catch((error: Error) => { setKeyMonitorError(error.message); setReminderStatus((current) => ({ ...current, [guildMember.id]: 'failed' })); }).finally(() => setReminderMemberId(null)); }} disabled={reminderMemberId === guildMember.id} className={`btn-outline inline-flex items-center gap-1 disabled:opacity-60 ${reminderStatus[guildMember.id] === 'success' ? 'text-success-400 border-success-500/30' : reminderStatus[guildMember.id] === 'failed' ? 'text-alert-400 border-alert-500/30' : 'text-alert-300 border-alert-500/30'}`}><Bell size={13} /> {reminderMemberId === guildMember.id ? 'Sending...' : reminderStatus[guildMember.id] === 'success' ? 'Success' : reminderStatus[guildMember.id] === 'failed' ? 'Failed' : 'Remind'}</button></div>)}</div></div></div>}</div>
                          {(selectedRole === 'member' || selectedRole === 'members') && <div className="space-y-2"><div className="hud-label">MEMBER KEYS</div>{keyMonitor.keys.filter((key) => key.role === 'member').map((key) => <div key={key.memberId} className="flex items-center gap-3 p-3 bg-ink-900/40 border border-ink-600"><div className="flex-1"><div className="font-heading text-sm text-white">{key.memberName}</div><div className="font-mono text-[10px] text-gray-500">UID {key.uid} · {key.keyStatus}</div></div><button onClick={() => { void guildApi.removeHlGamingKey(key.memberId).then(() => setKeyMonitor((current) => current ? { ...current, keys: current.keys.filter((item) => item.memberId !== key.memberId) } : current)).catch((error: Error) => setKeyMonitorError(error.message)); }} className="btn-outline text-alert-300 border-alert-500/30"><Trash2 size={14} /></button></div>)}</div>}
                        </div>
                      </div></div>
                    </div>;
                  })()}
                </div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setConfirmAction(null)}>
          <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
          <div className="relative glass-panel clip-tactical-lg p-8 max-w-md w-full animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-alert-500/10">
                <AlertTriangle size={24} className="text-alert-400" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-white uppercase tracking-wide">
                  {confirmAction.type === 'approve' ? 'Approve Member' : confirmAction.type === 'reject' ? 'Reject Request' : 'Suspend Member'}
                </h3>
                <p className="font-mono text-xs text-tactical-300">CONFIRM ACTION</p>
              </div>
            </div>
            <p className="text-gray-400 font-heading text-base mb-6">
              Are you sure you want to {confirmAction.type} <span className="text-white font-semibold">{confirmAction.member.displayName}</span>?
              {confirmAction.type === 'approve' && ' This will grant them full guild access.'}
              {confirmAction.type === 'reject' && ' This will remove their access request.'}
              {confirmAction.type === 'suspend' && ' This will revoke their guild access.'}
            </p>
            <div className="flex gap-3">
              <button
                      onClick={async () => {
                        try {
                          if (confirmAction.type === 'approve') approveMember(confirmAction.member.id);
                          if (confirmAction.type === 'reject') rejectMember(confirmAction.member.id);
                          if (confirmAction.type === 'suspend') await suspendMember(confirmAction.member.id);
                          setConfirmAction(null);
                        } catch (error) {
                          setRoleUpdateError(error instanceof Error ? error.message : 'Member removal failed.');
                        }
                      }}
                className={`flex-1 ${
                  confirmAction.type === 'approve'
                    ? 'bg-success-500 text-white hover:bg-success-400'
                    : 'bg-alert-500 text-white hover:bg-alert-400'
                } px-4 py-3 font-heading font-semibold uppercase tracking-wider transition-all clip-tactical flex items-center justify-center gap-2`}
              >
                <Check size={16} />
                Confirm
              </button>
              <button onClick={() => setConfirmAction(null)} className="btn-outline">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {automationDraft && automationDraft.channel === 'website' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={() => setAutomationDraft(null)}>
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm border border-neon-500/40 bg-ink-900 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="space-y-4"><label className="block"><span className="hud-label block mb-1">SEND</span><select value={automationSettings[`${automationDraft.role}:${automationDraft.channel}`]?.frequency || 'weekly'} onChange={(event) => setAutomationSettings((current) => ({ ...current, [`${automationDraft.role}:${automationDraft.channel}`]: { ...(current[`${automationDraft.role}:${automationDraft.channel}`] || { customDays: 1, notifications: { discord: true, website: true, device: true } }), frequency: event.target.value as 'daily' | 'weekly' | 'custom' } }))} className="w-full px-3 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-mono focus:border-neon-500/50 focus:outline-none"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom">Custom</option></select></label>{automationSettings[`${automationDraft.role}:${automationDraft.channel}`]?.frequency === 'custom' && <label className="block"><span className="hud-label block mb-1">SEND EVERY (DAYS)</span><input type="number" min="1" max="365" value={automationSettings[`${automationDraft.role}:${automationDraft.channel}`]?.customDays || 1} onChange={(event) => setAutomationSettings((current) => ({ ...current, [`${automationDraft.role}:${automationDraft.channel}`]: { ...(current[`${automationDraft.role}:${automationDraft.channel}`] || { frequency: 'custom', notifications: { discord: true, website: true, device: true } }), customDays: Number(event.target.value) } }))} className="w-full px-3 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-mono focus:border-neon-500/50 focus:outline-none" /></label>}<div><span className="hud-label block mb-2">NOTIFICATION TYPES</span><div className="space-y-2">{(['discord', 'website', 'device'] as const).map((notification) => { const key = `${automationDraft.role}:${automationDraft.channel}`; const current = automationSettings[key] || { frequency: 'weekly' as const, customDays: 1, notifications: { discord: true, website: true, device: true } }; return <div key={notification} className="flex items-center justify-between border border-ink-600 bg-ink-800/30 px-3 py-3"><span className="font-heading text-white">{notification === 'discord' ? 'Discord' : notification === 'website' ? 'Website' : 'Device'}</span><button onClick={() => setAutomationSettings((all) => ({ ...all, [key]: { ...current, notifications: { ...current.notifications, [notification]: !current.notifications[notification] } } }))} className={`px-3 py-1 font-mono text-[10px] uppercase border ${current.notifications[notification] ? 'text-success-400 border-success-500/40' : 'text-alert-400 border-alert-500/40'}`}>{current.notifications[notification] ? 'Enabled' : 'Disabled'}</button></div>; })}</div></div><div className="flex justify-end gap-2 pt-2"><button onClick={() => setAutomationDraft(null)} className="btn-outline">Cancel</button><button onClick={() => { const key = `${automationDraft.role}:${automationDraft.channel}`; setAutomationSettings((current) => ({ ...current, [key]: { ...(current[key] || { frequency: 'weekly', customDays: 1, notifications: { discord: true, website: true, device: true } }), enabled: true } })); setAutomationDraft(null); }} className="btn-neon">Save</button></div></div>
          </div>
        </div>
      )}

      {automationDraft?.channel === 'discord' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={() => setAutomationDraft(null)}>
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm border border-neon-500/40 bg-ink-900 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-5"><div><div className="hud-label mb-1">DISCORD AUTOMATION</div><h3 className="font-display font-bold text-xl text-white uppercase">Discord DM</h3></div><button onClick={() => setAutomationDraft(null)} className="text-gray-500 hover:text-white" aria-label="Close Discord automation settings">X</button></div>
            <div className="space-y-4"><label className="block"><span className="hud-label block mb-1">SEND</span><select value={automationSettings[`discord:${automationDraft.role}`]?.frequency || 'weekly'} onChange={(event) => setAutomationSettings((current) => ({ ...current, [`discord:${automationDraft.role}`]: { frequency: event.target.value as 'daily' | 'weekly', customDays: 1, notifications: { discord: true, website: false, device: false } } }))} className="w-full px-3 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-mono focus:border-neon-500/50 focus:outline-none"><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><div className="flex items-center justify-between border border-ink-600 bg-ink-800/30 px-3 py-3"><span className="font-heading text-white">Discord DM</span><span className="font-mono text-[10px] uppercase text-success-400">Enabled</span></div><div className="flex justify-end gap-2 pt-2"><button onClick={() => setAutomationDraft(null)} className="btn-outline">Cancel</button><button onClick={() => { const key = `discord:${automationDraft.role}`; setAutomationSettings((current) => ({ ...current, [key]: { ...(current[key] || { frequency: 'weekly', customDays: 1, notifications: { discord: true, website: false, device: false } }), enabled: true } })); setAutomationDraft(null); }} className="btn-neon">Save</button></div></div>
          </div>
        </div>
      )}

      {automationDraft?.channel === 'auto' && (() => {
        const automationKey = `auto:${automationDraft.role}`;
        const current = automationSettings[automationKey] || { frequency: 'weekly' as const, customDays: 1, notifications: { discord: true, website: false, device: true } };
        return <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={() => setAutomationDraft(null)}>
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm border border-neon-500/40 bg-ink-900 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-5"><div><div className="hud-label mb-1">AUTO REMINDER</div><h3 className="font-display font-bold text-xl text-white uppercase">{roleLabels[automationDraft.role]}</h3></div><button onClick={() => setAutomationDraft(null)} className="text-gray-500 hover:text-white" aria-label="Close Auto Reminder settings">X</button></div>
            <div className="space-y-4"><label className="block"><span className="hud-label block mb-1">SEND</span><select value={current.frequency} onChange={(event) => setAutomationSettings((all) => ({ ...all, [automationKey]: { ...current, frequency: event.target.value as 'daily' | 'weekly' | 'custom' } }))} className="w-full px-3 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-mono focus:border-neon-500/50 focus:outline-none"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom">Custom</option></select></label>{current.frequency === 'custom' && <label className="block"><span className="hud-label block mb-1">SEND EVERY (DAYS)</span><input type="number" min="1" max="365" value={current.customDays} onChange={(event) => setAutomationSettings((all) => ({ ...all, [automationKey]: { ...current, customDays: Number(event.target.value) } }))} className="w-full px-3 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-mono focus:border-neon-500/50 focus:outline-none" /></label>}<div><span className="hud-label block mb-2">NOTIFICATION TYPES</span><div className="space-y-2">{(['discord', 'device'] as const).map((notification) => <div key={notification} className="flex items-center justify-between border border-ink-600 bg-ink-800/30 px-3 py-3"><span className="font-heading text-white">{notification === 'discord' ? 'Discord' : 'Device'}</span><button onClick={() => setAutomationSettings((all) => ({ ...all, [automationKey]: { ...current, notifications: { ...current.notifications, [notification]: !current.notifications[notification] } } }))} className={`px-3 py-1 font-mono text-[10px] uppercase border ${current.notifications[notification] ? 'text-success-400 border-success-500/40' : 'text-alert-400 border-alert-500/40'}`}>{current.notifications[notification] ? 'Enabled' : 'Disabled'}</button></div>)}</div></div>{automationSaveState === 'success' && <div className="font-mono text-xs uppercase text-success-400">Auto reminder settings saved. No notification sent.</div>}{automationSaveState === 'failed' && <div className="font-mono text-xs uppercase text-alert-400">Auto reminder settings could not be saved.</div>}<div className="flex justify-end gap-2 pt-2"><button onClick={() => { setAutomationSaveState('idle'); setAutomationDraft(null); }} className="btn-outline">Cancel</button><button onClick={() => { try { setAutomationSettings((all) => ({ ...all, [automationKey]: { ...current, enabled: true } })); setAutomationSaveState('success'); } catch { setAutomationSaveState('failed'); } }} className="btn-neon">Save</button></div></div>
          </div>
        </div>;
      })()}

      {settingsConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setSettingsConfirmOpen(false)}>
          <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
          <div className="relative glass-panel clip-tactical-lg p-8 max-w-md w-full animate-scale-in" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-neon-500/10">
                <Settings size={24} className="text-neon-300" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-white uppercase tracking-wide">Save Guild Settings?</h3>
                <p className="font-mono text-xs text-tactical-300">UPDATE GUILD DATA AND LEADER STATS</p>
              </div>
            </div>
            <p className="text-gray-400 font-heading text-base mb-6">Save these changes and refresh the guild profile and guild leader combat data?</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={saveSettings} disabled={settingsSaving} className="flex-1 min-w-[140px] bg-neon-500 text-ink-950 px-4 py-3 font-heading font-semibold uppercase tracking-wider transition-all clip-tactical flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                <Check size={16} /> {settingsSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={resetSettings} disabled={settingsSaving} className="flex-1 min-w-[140px] btn-outline flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                <RotateCcw size={16} /> Reset Settings
              </button>
              <button onClick={() => setSettingsConfirmOpen(false)} disabled={settingsSaving} className="w-full text-gray-500 hover:text-white font-heading text-sm uppercase tracking-wider py-2 disabled:cursor-not-allowed">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isNonGuildMember(member: GuildMember) {
  return member.role === 'recruit';
}
