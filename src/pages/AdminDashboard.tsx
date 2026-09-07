import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { GuildMember, UserRole } from '@/types';
import { ROLE_LABELS, ROLE_COLORS } from '@/types';
import { GridBackground, ParticleField, ScanLines, Vignette, AnimatedNumber } from '@/components/effects/VisualEffects';
import { Shield, Users, Clock, Ban, UserPlus, Search, Check, X, AlertTriangle, Settings, Megaphone, Trophy, ChevronLeft, ChevronRight, MessageCircle, Trash2 } from 'lucide-react';

type AdminTab = 'overview' | 'pending' | 'members' | 'announcements' | 'events' | 'chat' | 'settings';

export function AdminDashboard() {
  const { member, members, events, announcements, chatMessages, deleteChatMessage, guildSettings, updateGuildSettings, approveMember, rejectMember, suspendMember, updateMemberRole, setView, openComposer } = useAuth();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [confirmAction, setConfirmAction] = useState<{ type: string; member: GuildMember } | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(guildSettings);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);

  useEffect(() => setSettingsDraft(guildSettings), [guildSettings]);

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

  const canManage = member?.role === 'admin' || member?.role === 'coadmin';
  const isOwner = member?.role === 'admin' && member.isOwner !== false;
  if (!canManage) {
    return (
      <div className="min-h-screen bg-ink-900 flex items-center justify-center pt-16">
        <div className="text-center">
          <Shield size={48} className="text-alert-500 mx-auto mb-4" />
          <h1 className="font-display font-bold text-2xl text-white uppercase tracking-wider">Access Denied</h1>
          <p className="font-mono text-sm text-gray-500 mt-2">ADMIN CLEARANCE REQUIRED</p>
        </div>
      </div>
    );
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

  const filteredMembers = approvedMembers.filter((m) => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    if (search && !m.displayName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const tabs: { id: AdminTab; label: string; icon: typeof Shield; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Shield },
    { id: 'pending', label: 'Pending', icon: Clock, badge: pendingMembers.length },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'events', label: 'Events', icon: Trophy },
    ...(isOwner ? [{ id: 'chat' as AdminTab, label: 'Chat Monitor', icon: MessageCircle }] : []),
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16">
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

              {/* Featured announcements */}
              <div className="glass-panel clip-tactical p-6">
                <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4">Featured Announcements</h3>
                <div className="space-y-2">
                  {announcements.filter((a) => a.featured).map((a) => (
                    <div key={a.id} className="flex items-center gap-3 p-3 bg-ink-800/30 border border-ink-600">
                      <Megaphone size={16} className="text-neon-400" />
                      <div className="flex-1">
                        <div className="font-heading font-semibold text-sm text-white">{a.title}</div>
                        <div className="font-mono text-xs text-gray-500">{a.date}</div>
                      </div>
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

              <div className="space-y-2">
                {filteredMembers.map((m) => (
                  <div key={m.id} className="tactical-card p-4 flex items-center gap-4 flex-wrap">
                    <img src={m.avatar} alt={m.displayName} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.displayName)}&background=f5a623&color=111827&size=200`; }} className="w-10 h-10 rounded-full object-cover border border-ink-600" />
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-semibold text-white">{m.displayName}</div>
                      <div className="font-mono text-xs text-gray-500">{m.discordName}</div>
                    </div>
                    {isOwner && !m.isOwner && <select
                      defaultValue={m.role}
                      onChange={(event) => updateMemberRole(m.id, event.target.value as UserRole)}
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

          {/* Announcements management */}
          {tab === 'announcements' && (
            <div className="space-y-4 animate-fade-in-up">
              <button onClick={() => { openComposer('announcement'); setView('announcements'); }} className="btn-neon flex items-center gap-2">
                <Megaphone size={18} />
                Create Announcement
              </button>
              {announcements.map((a) => (
                <div key={a.id} className="tactical-card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display font-bold text-lg text-white">{a.title}</h3>
                    {a.featured && <span className="px-2 py-0.5 bg-neon-500/15 border border-neon-500/30 font-mono text-[10px] text-neon-300 uppercase">Featured</span>}
                  </div>
                  <p className="text-gray-400 font-heading text-sm line-clamp-2">{a.content}</p>
                  <div className="font-mono text-xs text-gray-500 mt-2">{a.date} · by {a.author}</div>
                </div>
              ))}
            </div>
          )}

          {/* Events management */}
          {tab === 'events' && (
            <div className="space-y-4 animate-fade-in-up">
              <button onClick={() => { openComposer('event'); setView('events'); }} className="btn-neon flex items-center gap-2">
                <Trophy size={18} />
                Create Event
              </button>
              {events.map((e) => (
                <div key={e.id} className="tactical-card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display font-bold text-lg text-white">{e.name}</h3>
                    <span className="font-mono text-xs text-tactical-300 uppercase">{e.status}</span>
                  </div>
                  <p className="text-gray-400 font-heading text-sm line-clamp-2">{e.description}</p>
                  <div className="font-mono text-xs text-gray-500 mt-2">{e.date} · {e.time} · {e.participants.length}/{e.participantLimit} participants</div>
                </div>
              ))}
            </div>
          )}

          {/* Private chat monitoring */}
          {tab === 'chat' && isOwner && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="glass-panel clip-tactical p-6">
                <div className="flex items-center gap-3 mb-2">
                  <MessageCircle size={20} className="text-neon-400" />
                  <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Private DM Monitor</h3>
                </div>
                <p className="font-mono text-xs text-tactical-300 uppercase">Guild Leader oversight · {privateMessages.length} messages</p>
              </div>
              {privateMessages.length === 0 && (
                <div className="text-center py-20 font-mono text-sm text-gray-500 uppercase">No private messages yet</div>
              )}
              {privateMessages.map((message) => {
                const recipient = members.find((item) => item.id === message.recipientId);
                return (
                  <div key={message.id} className="tactical-card p-4 flex items-start gap-4">
                    <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-neon-500/15 border border-neon-500/30 font-heading font-bold text-neon-300">
                      {message.authorName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap font-heading font-bold text-white">
                        <span>{message.authorName}</span>
                        <span className="text-gray-600">to</span>
                        <span>{recipient?.displayName || 'Guild member'}</span>
                        <span className="font-mono text-[10px] text-gray-500">{new Date(message.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-2 text-gray-300 font-heading text-sm break-words">{message.content}</p>
                    </div>
                    <button onClick={() => deleteChatMessage(message.id)} className="p-2 text-gray-600 hover:text-alert-400" title="Delete private message" aria-label="Delete private message">
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
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
                  <button onClick={() => {
                    void updateGuildSettings(settingsDraft).then(() => {
                      setSettingsError(false);
                      setSettingsSaved(true);
                      setTimeout(() => setSettingsSaved(false), 2500);
                    }).catch(() => {
                      setSettingsSaved(false);
                      setSettingsError(true);
                    });
                  }} className="btn-neon">Save Settings</button>
                  {settingsSaved && <span className="ml-3 font-mono text-xs text-success-400">SETTINGS SAVED</span>}
                  {settingsError && <span className="ml-3 font-mono text-xs text-alert-400">SETTINGS NOT SAVED</span>}
                </div>
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
                      onClick={() => {
                        if (confirmAction.type === 'approve') approveMember(confirmAction.member.id);
                        if (confirmAction.type === 'reject') rejectMember(confirmAction.member.id);
                        if (confirmAction.type === 'suspend') suspendMember(confirmAction.member.id);
                        setConfirmAction(null);
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
    </div>
  );
}
