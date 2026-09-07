import { useRef, useState, useEffect } from 'react';
import { EMPTY_MEMBER_STATS, type GuildMember } from '@/types';
import { ROLE_LABELS, ROLE_COLORS } from '@/types';
import { GridBackground, ParticleField, ScanLines, Vignette, HudCorners } from '@/components/effects/VisualEffects';
import { ArrowLeft, Award, Shield, Zap, Target, Skull, Star, ExternalLink, Download, X } from 'lucide-react';

interface MemberProfileProps {
  member: GuildMember;
  onBack: () => void;
  overlay?: boolean;
}

export function MemberProfile({ member, onBack, overlay = false }: MemberProfileProps) {
  const stats = member.stats ?? EMPTY_MEMBER_STATS;
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const profileMismatch = Boolean(
    (member.discordDisplayName && member.discordDisplayName !== member.displayName)
    || (member.discordAvatar && member.discordAvatar !== member.avatar),
  );
  const [showDiscordInstallNotice, setShowDiscordInstallNotice] = useState(profileMismatch);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowDiscordInstallNotice(profileMismatch);
  }, [member.id, profileMismatch]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  return (
    <div className={`${overlay ? 'fixed inset-0 z-40 overflow-y-auto bg-ink-900/85 backdrop-blur-sm' : 'min-h-screen bg-ink-900'} relative overflow-hidden pt-16`} ref={containerRef} onMouseMove={handleMouseMove} role={overlay ? 'dialog' : undefined} aria-modal={overlay ? 'true' : undefined}>
      <GridBackground />
      <ParticleField count={40} />
      <ScanLines />
      <Vignette />
      <HudCorners />

      {showDiscordInstallNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowDiscordInstallNotice(false)}>
          <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
          <div className="relative glass-panel clip-tactical-lg p-6 md:p-8 max-w-md w-full animate-scale-in" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => setShowDiscordInstallNotice(false)} className="absolute top-3 right-3 p-2 text-gray-500 hover:text-white" aria-label="Close Discord install message">
              <X size={18} />
            </button>
            <Download size={28} className="text-neon-400 mb-4" />
            <h2 className="font-display font-bold text-xl text-white uppercase tracking-wider mb-3">Sync Discord Profile</h2>
            <p className="text-gray-400 font-heading text-sm leading-relaxed mb-5">
              Your website profile does not match your Discord profile. Install Discord, then sign in so your avatar and profile details can sync.
            </p>
            <ol className="space-y-2 mb-5 text-gray-400 font-mono text-xs">
              <li><span className="text-neon-400">01</span> Download Discord for your device.</li>
              <li><span className="text-neon-400">02</span> Install it and sign in to your account.</li>
              <li><span className="text-neon-400">03</span> Return here and continue.</li>
            </ol>
            <div className="flex gap-3">
              <a href="https://discord.com/download" target="_blank" rel="noreferrer" className="btn-neon flex-1 flex items-center justify-center gap-2 text-xs">
                <Download size={15} /> Download Discord
              </a>
              <button onClick={() => setShowDiscordInstallNotice(false)} className="btn-outline px-4 text-xs">Continue</button>
            </div>
          </div>
        </div>
      )}

      <div className={`relative z-10 px-4 md:px-8 py-8 ${overlay ? 'min-h-full flex items-start justify-center' : ''}`}>
        <div className={`${overlay ? 'max-w-6xl w-full glass-panel clip-tactical-lg p-2 md:p-4' : 'max-w-7xl'} mx-auto`}>
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 font-heading font-semibold text-sm uppercase tracking-wider text-tactical-300 hover:text-neon-400 transition-colors mb-6 animate-fade-in"
          >
            <ArrowLeft size={18} />
            Back to Roster
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Character display */}
            <div className="relative animate-fade-in-up" style={{ perspective: '1000px' }}>
              <div
                className="relative aspect-[3/4] overflow-hidden glass-panel clip-tactical-lg"
                style={{
                  transform: `rotateY(${mousePos.x * 5}deg) rotateX(${mousePos.y * -5}deg)`,
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.2s ease-out',
                }}
              >
                {/* Background */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${getRoleBg(member.role)} 0%, rgba(10, 14, 20, 0.95) 100%)`,
                  }}
                />
                <div className="absolute inset-0 bg-tactical-grid bg-grid-50 opacity-20" />

                {/* Character */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'translateZ(40px)' }}>
                  <div className="relative">
                    <div className="absolute inset-0 -m-8 border border-neon-500/20 rotate-45 animate-spin-slow" />
                    <div className="absolute inset-0 -m-12 border border-tactical-500/10 rotate-45" />
                    <img
                      src={member.avatar}
                      alt={member.displayName}
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.displayName)}&background=f5a623&color=111827&size=200`;
                      }}
                      className="w-48 h-48 md:w-56 md:h-56 rounded-full object-cover border-2 border-neon-500/40"
                      style={{ transform: `translateX(${mousePos.x * 15}px) translateY(${mousePos.y * 15}px)` }}
                    />
                    {/* Aura effect */}
                    {member.character.effects.aura !== 'None' && (
                      <div className="absolute inset-0 -m-4 rounded-full animate-pulse-glow" style={{ background: getAuraColor(member.character.effects.aura), filter: 'blur(20px)', opacity: 0.3 }} />
                    )}
                  </div>
                </div>

                {/* HUD elements */}
                <div className="absolute top-4 left-4 font-mono text-xs text-tactical-300">
                  <div>ID: #{member.discordId}</div>
                  <div>STATUS: <span className={getPresenceColor(member.presence)}>{getPresenceLabel(member.presence)}</span></div>
                </div>
                <div className="absolute top-4 right-4 px-3 py-1 bg-ink-900/80 border border-neon-500/30 font-mono text-xs text-neon-300 uppercase">
                  {member.rank}
                </div>

                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-ink-900 via-ink-900/80 to-transparent">
                  <div className={`font-heading font-bold text-2xl uppercase tracking-wider ${ROLE_COLORS[member.role]}`}>
                    {ROLE_LABELS[member.role]}
                  </div>
                  <div className="font-mono text-xs text-gray-500 mt-1">
                    JOINED: {member.joinDate}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Info panel */}
            <div className="space-y-6">
              {/* Name & bio */}
              <div className="glass-panel clip-tactical p-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                <h1 className="font-display font-black text-3xl md:text-4xl text-white tracking-wider mb-2">
                  {member.displayName}
                </h1>
                <div className="font-mono text-sm text-tactical-300 mb-4">{member.discordName}</div>
                <p className="text-gray-400 font-heading text-base leading-relaxed">{member.bio}</p>
              </div>

              <div className="glass-panel clip-tactical p-6 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Discord Profile</h3>
                  <ExternalLink size={18} className="text-neon-400" />
                </div>
                <div className="flex items-center gap-4">
                  <img src={member.discordAvatar || member.avatar} alt={member.discordDisplayName || member.displayName} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.discordDisplayName || member.displayName)}&background=f5a623&color=111827&size=200`; }} className="w-16 h-16 rounded-full object-cover border-2 border-neon-500/40" />
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-bold text-white text-lg truncate">{member.discordDisplayName || member.displayName}</div>
                    <div className="font-mono text-xs text-tactical-300 truncate">{member.discordName}</div>
                    <div className="font-mono text-[10px] text-gray-500 mt-1">DISCORD ID: {member.discordId}</div>
                  </div>
                  <a href={`https://discord.com/users/${member.discordId}`} target="_blank" rel="noreferrer" className="btn-outline px-3 py-2 text-xs">Open</a>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                {[
                  { icon: Award, label: 'Account Level', value: stats.accountLevel.toLocaleString(), color: 'text-neon-300' },
                  { icon: Zap, label: 'Matches', value: stats.matches.toLocaleString(), color: 'text-neon-400' },
                  { icon: Target, label: 'Win Rate', value: `${stats.winRate}%`, color: 'text-success-400' },
                  { icon: Skull, label: 'Eliminations', value: stats.eliminations.toLocaleString(), color: 'text-alert-400' },
                  { icon: Star, label: 'Booyahs', value: stats.booyahs.toLocaleString(), color: 'text-neon-300' },
                  { icon: Target, label: 'Headshot Rate', value: `${stats.headshotRate}%`, color: 'text-success-400' },
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div key={i} className="tactical-card p-4 flex items-center gap-3">
                      <Icon size={24} className={stat.color} />
                      <div>
                        <div className="font-display font-bold text-xl text-white">{stat.value}</div>
                        <div className="font-mono text-xs text-gray-500 uppercase">{stat.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Achievements */}
              <div className="glass-panel clip-tactical p-6 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Award size={20} className="text-neon-400" />
                  <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Achievements</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {member.achievements.length > 0 ? (
                    member.achievements.map((ach, i) => (
                      <div
                        key={i}
                        className="px-3 py-2 bg-neon-500/10 border border-neon-500/30 font-heading font-semibold text-sm text-neon-300 uppercase tracking-wider clip-tactical"
                      >
                        {ach}
                      </div>
                    ))
                  ) : (
                    <div className="font-mono text-xs text-gray-500">NO ACHIEVEMENTS YET</div>
                  )}
                </div>
              </div>

              {/* Loadout */}
              <div className="glass-panel clip-tactical p-6 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Shield size={20} className="text-tactical-300" />
                  <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Current Loadout</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <LoadoutItem label="Headwear" value={member.character.outfit.headwear} />
                  <LoadoutItem label="Top" value={member.character.outfit.top} />
                  <LoadoutItem label="Bottom" value={member.character.outfit.bottom} />
                  <LoadoutItem label="Footwear" value={member.character.outfit.footwear} />
                  <LoadoutItem label="Aura" value={member.character.effects.aura} />
                  <LoadoutItem label="Card Effect" value={member.character.effects.cardEffect} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadoutItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-ink-800/50 border border-ink-600">
      <div className="font-mono text-[10px] text-gray-500 uppercase tracking-widest mb-1">{label}</div>
      <div className="font-heading font-semibold text-sm text-tactical-200">{value}</div>
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

function getAuraColor(aura: string): string {
  if (aura.includes('Frost')) return '#3a8fb8';
  if (aura.includes('Golden')) return '#f5a623';
  if (aura.includes('Inferno')) return '#ff4444';
  return '#f5a623';
}

function getPresenceLabel(presence: GuildMember['presence']): string {
  if (presence === 'idle') return 'IDLE';
  if (presence === 'dnd') return 'DO NOT DISTURB';
  if (presence === 'online') return 'ONLINE';
  return 'OFFLINE';
}

function getPresenceColor(presence: GuildMember['presence']): string {
  if (presence === 'idle') return 'text-warning-400';
  if (presence === 'dnd') return 'text-alert-400';
  if (presence === 'online') return 'text-success-400';
  return 'text-gray-500';
}
