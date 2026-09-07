import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import { GridBackground, ParticleField, ScanLines, Vignette, HudCorners } from '@/components/effects/VisualEffects';
import { Users, Trophy, Shirt, MessageCircle, ChevronRight, Zap, Crosshair, Skull } from 'lucide-react';

export function LandingPage() {
  const { login, guildSettings, guildStats } = useAuth();
  const [authError] = useState(() => new URLSearchParams(window.location.search).get('auth_error'));

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden">
      <GridBackground />
      <ParticleField count={60} />
      <ScanLines />
      <Vignette />

      {/* Hero section */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        <HudCorners />

        {/* Top badge */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 glass-panel clip-tactical animate-fade-in-down">
          <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-widest text-tactical-200">Server Online · {guildStats.totalMembers} Members · {guildStats.onlineMembers} Online</span>
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center gap-6 mb-8 animate-scale-in">
          <div className="relative w-28 h-28">
            <div className="absolute inset-0 border-2 border-neon-500/60 rotate-45 animate-spin-slow" />
            <div className="absolute inset-3 border border-tactical-400/40 rotate-45" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display font-black text-4xl text-neon-400 text-glow">FF</span>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-2 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <h1 className="font-display font-black text-5xl md:text-7xl text-white tracking-wider mb-2">
            FREE FIRE
          </h1>
          <h2 className="font-display font-bold text-2xl md:text-3xl gradient-text tracking-[0.3em] uppercase">
            {guildSettings.name}
          </h2>
        </div>

        {/* Tagline */}
        <p className="text-center text-gray-400 font-heading text-lg md:text-xl max-w-2xl mb-10 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          Enter the tactical command center. Connect with your squad. <br className="hidden md:block" />
          Dominate the battlefield together.
        </p>

        {/* Login CTA */}
        <div className="flex flex-col items-center gap-4 animate-fade-in-up" style={{ animationDelay: '600ms' }}>
          {authError === 'not_in_guild' && <div className="max-w-md border border-alert-500/40 bg-alert-500/10 px-4 py-3 text-center font-heading text-sm text-alert-300 clip-tactical">
            Join the Discord server first, then log in again.
            <a href="https://discord.com/oauth2/authorize?client_id=1546098098575511603" target="_blank" rel="noreferrer" className="block mt-2 text-neon-300 hover:text-neon-200 underline">Install Discord App</a>
          </div>}
          <button
            onClick={login}
            className="btn-neon group flex items-center gap-3 text-base"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden>
              <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.35 16.35 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.88-.95-1.88-2.11s.84-2.11 1.88-2.11c1.06 0 1.9.96 1.88 2.11c0 1.16-.84 2.11-1.88 2.11zm6.97 0c-1.03 0-1.88-.95-1.88-2.11s.84-2.11 1.88-2.11c1.06 0 1.9.96 1.88 2.11c0 1.16-.83 2.11-1.88 2.11z" />
            </svg>
            <span>Login with Discord</span>
            <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">
            Secure Authentication · Guild Members Only
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 max-w-4xl w-full animate-fade-in-up" style={{ animationDelay: '800ms' }}>
          {[
            { icon: Users, label: 'Guild Roster', desc: 'Meet the squad' },
            { icon: Shirt, label: 'Customization', desc: 'Build your loadout' },
            { icon: Trophy, label: 'Guild Events', desc: 'Compete together' },
            { icon: MessageCircle, label: 'Squad Chat', desc: 'Talk with the squad' },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="tactical-card p-4 flex flex-col items-center gap-2 text-center group"
              >
                <Icon size={28} className="text-neon-400 group-hover:scale-110 transition-transform" />
                <div className="font-heading font-semibold text-white text-sm uppercase tracking-wider">{f.label}</div>
                <div className="font-mono text-xs text-gray-500">{f.desc}</div>
              </div>
            );
          })}
        </div>

        {/* Bottom stats bar */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-tactical-700/30 bg-ink-800/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-center gap-6 md:justify-between">
            <div className="flex items-center gap-2 font-mono text-xs text-tactical-300">
              <Crosshair size={14} className="text-neon-400" />
              <span>BERMUDA SECTOR</span>
            </div>
            <div className="flex items-center gap-6 font-mono text-xs text-gray-500">
              <span><Skull size={12} className="inline mr-1 text-alert-500" /> 2,847 Booyahs</span>
              <span><Zap size={12} className="inline mr-1 text-neon-400" /> {guildStats.onlineMembers} Online / {guildStats.totalMembers} Members</span>
              <span className="hidden md:inline"><Trophy size={12} className="inline mr-1 text-success-500" /> Rank #3 Global</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
