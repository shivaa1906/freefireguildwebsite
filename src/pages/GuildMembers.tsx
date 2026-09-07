import { useRef, useState, useEffect } from 'react';
import type { GuildMember } from '@/types';
import { CHAT_ROLES, ROLE_LABELS, ROLE_COLORS } from '@/types';
import { GridBackground, ParticleField, ScanLines, Vignette } from '@/components/effects/VisualEffects';
import { Search, Filter, ChevronRight, Award, Calendar, Circle, Plus, ExternalLink, MessageCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface GuildMembersProps {
  members: GuildMember[];
  onSelectMember: (member: GuildMember) => void;
}

type RoleFilter = 'all' | 'admin' | 'coadmin' | 'moderator' | 'member' | 'recruit';

export function GuildMembers({ members, onSelectMember }: GuildMembersProps) {
  const { member, setView } = useAuth();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [loading, setLoading] = useState(true);
  const [showGrid, setShowGrid] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => {
      setLoading(false);
      setShowGrid(true);
    }, prefersReducedMotion ? 200 : 1800);
    return () => clearTimeout(timer);
  }, []);

  const filtered = members.map((m) => m.isInDiscordGuild === false ? { ...m, role: 'recruit' as const } : m.role ? m : { ...m, role: 'recruit' as const }).filter((m) => {
    const isWebsiteMember = m.role === 'recruit' || m.isInDiscordGuild === false;
    if (isWebsiteMember && (roleFilter === 'all' || roleFilter === 'recruit')) return matchesSearch(m, search);
    if (m.status !== 'approved') return false;
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    return matchesSearch(m, search);
  });

  const roleFilters: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'admin', label: 'Guild Leader' },
    { value: 'coadmin', label: 'Acting Leader' },
    { value: 'moderator', label: 'Elder' },
    { value: 'member', label: 'Guild Member' },
    { value: 'recruit', label: 'Members' },
  ];

  const roleSections = roleFilters.slice(1).map((role) => ({
    ...role,
    members: filtered.filter((member) => member.role === role.value),
  })).filter((section) => section.members.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-900 relative overflow-hidden flex items-center justify-center">
        <GridBackground />
        <ParticleField count={40} />
        <ScanLines />
        <Vignette />
        <div className="relative z-10 text-center">
          <div className="font-mono text-sm text-tactical-300 mb-4 animate-blink">LOADING GUILD ROSTER</div>
          <div className="w-64 h-1 bg-ink-600 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-neon-500 rounded-full animate-shimmer" style={{ width: '60%' }} />
          </div>
          <div className="mt-4 font-mono text-xs text-gray-500">SCANNING DATABASE...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16">
      <GridBackground />
      <ParticleField count={30} />
      <Vignette />

      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-end justify-between flex-wrap gap-4 mb-8 animate-fade-in-down">
            <div>
              <div className="hud-label mb-1">TACTICAL DATABASE · GUILD ROSTER</div>
              <h1 className="section-title text-3xl md:text-4xl">Guild Members</h1>
            </div>
            <button onClick={() => setView(member && CHAT_ROLES.includes(member.role) ? 'chat' : 'pending')} className="btn-neon flex items-center gap-2">
              {member && CHAT_ROLES.includes(member.role) ? <MessageCircle size={18} /> : <Plus size={18} />}
              {member && CHAT_ROLES.includes(member.role) ? 'Chat' : 'Join Guild'}
            </button>
          </div>

          {/* Search & filter */}
          <div className="flex flex-col md:flex-row gap-4 mb-8 animate-fade-in-up">
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
              <Filter size={16} className="text-tactical-300 flex-shrink-0" />
              {roleFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setRoleFilter(f.value)}
                  className={`px-3 py-2 font-heading font-semibold text-xs uppercase tracking-wider whitespace-nowrap transition-all clip-tactical ${
                    roleFilter === f.value
                      ? 'bg-neon-500/20 text-neon-300 border border-neon-500/40'
                      : 'text-gray-500 border border-tactical-700/30 hover:text-tactical-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results count */}
          <div className="mb-4 font-mono text-xs text-gray-500">
            SHOWING {filtered.length} MEMBERS
          </div>

          {/* Member grid */}
          {showGrid && roleFilter === 'all' && (
            <div className="space-y-8">
              {roleSections.map((section) => (
                <section key={section.value}>
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="font-heading font-bold text-neon-300 text-sm uppercase tracking-[0.2em]">{section.label}</h2>
                    <div className="h-px flex-1 bg-tactical-700/40" />
                    <span className="font-mono text-[10px] text-gray-500">{section.members.length}</span>
                  </div>
                  <MemberGrid members={section.members} onSelectMember={onSelectMember} />
                </section>
              ))}
            </div>
          )}

          {showGrid && roleFilter !== 'all' && <MemberGrid members={filtered} onSelectMember={onSelectMember} />}

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <div className="font-mono text-sm text-gray-500">NO MEMBERS FOUND MATCHING YOUR SEARCH</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function matchesSearch(member: GuildMember, search: string) {
  if (!search) return true;
  const query = search.toLowerCase();
  return member.displayName.toLowerCase().includes(query) || member.discordName.toLowerCase().includes(query);
}

function MemberGrid({ members, onSelectMember }: { members: GuildMember[]; onSelectMember: (member: GuildMember) => void }) {
  return (
    <div className="max-h-[calc(100vh-15rem)] overflow-y-auto scroll-smooth pr-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {members.map((member, index) => (
        <MemberCard key={member.id} member={member} index={index} onClick={() => onSelectMember(member)} />
      ))}
      </div>
    </div>
  );
}

function MemberCard({ member, index, onClick }: { member: GuildMember; index: number; onClick: () => void }) {
  const { rankingScores } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const rankingScore = rankingScores.filter((score) => score.memberId === member.id).reduce((total, score) => total + score.points, 0);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -10, y: x * 10 });
  };

  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className="relative group cursor-pointer animate-fade-in-up"
      style={{
        animationDelay: `${index * 80}ms`,
        perspective: '1000px',
      }}
    >
      <div
        className="tactical-card overflow-hidden relative transition-transform duration-200 ease-out"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Character area */}
        <div className="relative h-48 overflow-hidden" style={{ transform: 'translateZ(20px)' }}>
          {/* Background gradient */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${getRoleBg(member.role)} 0%, rgba(15, 20, 28, 0.9) 100%)`,
            }}
          />
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-tactical-grid bg-grid-50 opacity-30" />
          {/* Scan line on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="absolute inset-x-0 h-px bg-neon-500/50 top-0 group-hover:animate-scan-line" />
          </div>

          {/* Avatar */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative" style={{ transform: 'translateZ(40px)' }}>
              <div className="absolute inset-0 -m-4 border border-neon-500/20 rotate-45 group-hover:rotate-90 transition-transform duration-500" />
              <img
                src={member.avatar}
                alt={member.displayName}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.displayName)}&background=f5a623&color=111827&size=200`;
                }}
                className="w-24 h-24 rounded-full object-cover border-2 border-neon-500/40 group-hover:border-neon-500 group-hover:scale-105 transition-all duration-300"
              />
              {/* Online indicator */}
              <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-ink-800 flex items-center justify-center ${getPresenceDotColor(member.presence)}`}>
                <Circle size={8} className="fill-current" />
              </div>
            </div>
          </div>

          {/* Rank badge */}
          <div className="absolute top-2 right-2 px-2 py-1 bg-ink-900/80 border border-neon-500/30 font-mono text-[10px] text-neon-300 uppercase tracking-wider">
            {member.rank}
          </div>
        </div>

        {/* Info area */}
        <div className="p-4 space-y-2" style={{ transform: 'translateZ(15px)' }}>
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-white text-base tracking-wide">{member.displayName}</h3>
            <ChevronRight size={16} className="text-gray-600 group-hover:text-neon-400 group-hover:translate-x-1 transition-all" />
          </div>
          <div className="font-mono text-xs text-gray-500">{member.discordName}</div>
          <a
            href={`https://discord.com/users/${member.discordId}`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-tactical-300 hover:text-neon-400"
          >
            <ExternalLink size={10} /> Discord Profile
          </a>
          <div className="flex items-center gap-2">
            <div className={`px-2 py-0.5 font-heading font-semibold text-xs uppercase tracking-wider ${ROLE_COLORS[member.role]}`}>
              {ROLE_LABELS[member.role]}
            </div>
            <div className={`font-mono text-[10px] uppercase ${getPresenceColor(member.presence)}`}>
              {getPresenceLabel(member.presence)}
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-3 pt-2 border-t border-ink-600">
            <div className="flex items-center gap-1 font-mono text-xs text-gray-500">
              <Calendar size={12} />
              <span>{member.joinDate}</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-xs text-gray-500">
              <Award size={12} className="text-neon-400" />
              <span>{rankingScore} Rank Score</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getRoleBg(role: string): string {
  const map: Record<string, string> = {
    admin: 'rgba(245, 166, 35, 0.15)',
    moderator: 'rgba(58, 143, 184, 0.15)',
    elite: 'rgba(0, 217, 126, 0.12)',
    member: 'rgba(42, 111, 153, 0.1)',
    recruit: 'rgba(255, 170, 0, 0.1)',
  };
  return map[role] || 'rgba(42, 111, 153, 0.1)';
}

function getPresenceState(presence: GuildMember['presence']): GuildMember['presence'] {
  return presence || 'offline';
}

function getPresenceLabel(presence: GuildMember['presence']): string {
  const state = getPresenceState(presence);
  if (state === 'idle') return 'Idle';
  if (state === 'dnd') return 'Do Not Disturb';
  if (state === 'online') return 'Online';
  return 'Offline';
}

function getPresenceColor(presence: GuildMember['presence']): string {
  const state = getPresenceState(presence);
  if (state === 'idle') return 'text-warning-400';
  if (state === 'dnd') return 'text-alert-400';
  if (state === 'online') return 'text-success-400';
  return 'text-gray-500';
}

function getPresenceDotColor(presence: GuildMember['presence']): string {
  const state = getPresenceState(presence);
  if (state === 'idle') return 'bg-warning-500 text-warning-400';
  if (state === 'dnd') return 'bg-alert-500 text-alert-400';
  if (state === 'online') return 'bg-success-500 text-success-400';
  return 'bg-gray-600 text-gray-400';
}
