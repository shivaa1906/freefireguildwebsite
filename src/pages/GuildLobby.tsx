import { useState, useEffect, useRef } from 'react';
import { useAuth, type AppView } from '@/context/AuthContext';
import { GridBackground, ParticleField, ScanLines, Vignette, HudCorners } from '@/components/effects/VisualEffects';
import { mockMapLocations } from '@/data/mockData';
import { Building2, Users, Shirt, Trophy, Megaphone, MessageCircle, ChevronRight } from 'lucide-react';
import type { MapLocation } from '@/types';

const ICON_MAP: Record<string, typeof Building2> = {
  Building2,
  Users,
  Shirt,
  Trophy,
  Megaphone,
  MessageCircle,
};

interface GuildLobbyProps {
  onNavigate: (view: AppView) => void;
}

export function GuildLobby({ onNavigate }: GuildLobbyProps) {
  const { member, guildSettings } = useAuth();
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);
  const [cameraZoom, setCameraZoom] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setCameraZoom(true);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const visibleLocations = mockMapLocations.filter(
    (loc) => !loc.adminOnly || member?.role === 'admin'
  );

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16" ref={containerRef} onMouseMove={handleMouseMove}>
      <GridBackground />
      <ParticleField count={50} />
      <ScanLines />
      <Vignette />

      {/* Header */}
      <div className="relative z-10 px-4 md:px-8 pt-8 pb-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="animate-fade-in-down">
              <div className="hud-label mb-1">GUILD HEADQUARTERS</div>
              <h1 className="section-title text-3xl md:text-4xl">{guildSettings.name}</h1>
            </div>
            <div className="flex items-center gap-3 glass-panel px-4 py-2 clip-tactical animate-fade-in-down">
              <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
              <span className="font-mono text-xs text-tactical-200 uppercase tracking-widest">
                Welcome, {member?.displayName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3D Island Map */}
      <div className="relative z-10 flex-1 px-4 md:px-8 pb-8">
        <div className="max-w-7xl mx-auto">
          <div
            className="relative aspect-[16/10] md:aspect-[16/9] w-full overflow-hidden"
            style={{
              perspective: '1200px',
              transform: `rotateX(${5 + mousePos.y * 3}deg) rotateY(${mousePos.x * -3}deg)`,
              transition: 'transform 0.2s ease-out',
            }}
          >
            {/* Island base */}
            <div
              className={`absolute inset-0 transition-transform duration-[2000ms] ease-out ${
                cameraZoom ? 'scale-100' : 'scale-150'
              }`}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Ocean background */}
              <div
                className="absolute inset-0"
                style={{
                  background: 'radial-gradient(ellipse at 50% 55%, rgba(16, 42, 68, 0.6) 0%, rgba(10, 25, 41, 0.9) 50%, rgba(5, 7, 10, 1) 100%)',
                }}
              />

              {/* Island shape */}
              <svg
                viewBox="0 0 1000 600"
                className="absolute inset-0 w-full h-full"
                style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.6))' }}
              >
                {/* Water depth shadows */}
                <ellipse cx="500" cy="320" rx="420" ry="230" fill="rgba(16, 42, 68, 0.4)" />
                <ellipse cx="500" cy="320" rx="380" ry="200" fill="rgba(16, 61, 92, 0.3)" />

                {/* Island landmass */}
                <path
                  d="M 180 280
                     C 120 250, 140 180, 220 160
                     C 280 145, 320 120, 400 130
                     C 480 140, 560 110, 640 130
                     C 720 150, 800 140, 850 180
                     C 900 220, 880 290, 860 340
                     C 840 390, 800 440, 740 450
                     C 680 460, 620 470, 560 460
                     C 500 450, 440 470, 380 460
                     C 320 450, 260 440, 220 400
                     C 180 360, 160 320, 180 280 Z"
                  fill="#1a2818"
                  stroke="rgba(42, 111, 153, 0.3)"
                  strokeWidth="1"
                />
                  {/* Beach border */}
                  <path
                    d="M 180 280
                       C 120 250, 140 180, 220 160
                       C 280 145, 320 120, 400 130
                       C 480 140, 560 110, 640 130
                       C 720 150, 800 140, 850 180
                       C 900 220, 880 290, 860 340
                       C 840 390, 800 440, 740 450
                       C 680 460, 620 470, 560 460
                       C 500 450, 440 470, 380 460
                       C 320 450, 260 440, 220 400
                       C 180 360, 160 320, 180 280 Z"
                    fill="none"
                    stroke="rgba(245, 166, 35, 0.15)"
                    strokeWidth="4"
                    strokeDasharray="2 6"
                  />

                  {/* Terrain features */}
                  {/* Mountains */}
                  <polygon points="350,200 400,140 450,200" fill="#2a3a28" opacity="0.8" />
                  <polygon points="370,200 400,160 430,200" fill="#3a4a38" opacity="0.6" />
                  <polygon points="600,180 650,130 700,180" fill="#2a3a28" opacity="0.8" />
                  <polygon points="620,180 650,150 680,180" fill="#3a4a38" opacity="0.6" />

                  {/* Forest areas */}
                  <circle cx="280" cy="350" r="30" fill="#1a2a18" opacity="0.7" />
                  <circle cx="320" cy="370" r="25" fill="#1a2a18" opacity="0.7" />
                  <circle cx="250" cy="380" r="20" fill="#1a2a18" opacity="0.7" />
                  <circle cx="720" cy="380" r="28" fill="#1a2a18" opacity="0.7" />
                  <circle cx="760" cy="360" r="22" fill="#1a2a18" opacity="0.7" />
                  <circle cx="680" cy="400" r="20" fill="#1a2a18" opacity="0.7" />

                  {/* Roads */}
                  <path d="M 300 300 Q 500 280 700 320" stroke="rgba(245, 166, 35, 0.2)" strokeWidth="2" fill="none" strokeDasharray="4 4" />
                  <path d="M 500 180 L 500 450" stroke="rgba(245, 166, 35, 0.15)" strokeWidth="2" fill="none" strokeDasharray="4 4" />
                  <path d="M 250 400 Q 400 420 550 400 Q 700 380 800 350" stroke="rgba(245, 166, 35, 0.15)" strokeWidth="2" fill="none" strokeDasharray="4 4" />

                  {/* Buildings */}
                  <rect x="470" y="195" width="60" height="40" fill="#1e2530" stroke="rgba(245, 166, 35, 0.4)" strokeWidth="1" rx="2" />
                  <rect x="225" y="340" width="50" height="35" fill="#1e2530" stroke="rgba(58, 143, 184, 0.4)" strokeWidth="1" rx="2" />
                  <rect x="670" y="330" width="55" height="38" fill="#1e2530" stroke="rgba(0, 217, 126, 0.4)" strokeWidth="1" rx="2" />
                  <rect x="380" y="420" width="45" height="30" fill="#1e2530" stroke="rgba(245, 166, 35, 0.4)" strokeWidth="1" rx="2" />
                  <rect x="575" y="170" width="50" height="35" fill="#1e2530" stroke="rgba(255, 68, 68, 0.4)" strokeWidth="1" rx="2" />
                  <rect x="780" y="220" width="48" height="32" fill="#1e2530" stroke="rgba(245, 166, 35, 0.4)" strokeWidth="1" rx="2" />

                  {/* Grid overlay on island */}
                  <pattern id="islandGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(42, 111, 153, 0.08)" strokeWidth="0.5" />
                  </pattern>
                  <path
                    d="M 180 280 C 120 250, 140 180, 220 160 C 280 145, 320 120, 400 130 C 480 140, 560 110, 640 130 C 720 150, 800 140, 850 180 C 900 220, 880 290, 860 340 C 840 390, 800 440, 740 450 C 680 460, 620 470, 560 460 C 500 450, 440 470, 380 460 C 320 450, 260 440, 220 400 C 180 360, 160 320, 180 280 Z"
                    fill="url(#islandGrid)"
                  />

                  {/* Location markers */}
                  {visibleLocations.map((loc) => {
                    const cx = (loc.x / 100) * 1000;
                    const cy = (loc.y / 100) * 600;
                    const isHovered = hoveredId === loc.id;
                    return (
                      <g
                        key={loc.id}
                        onMouseEnter={() => setHoveredId(loc.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => setSelectedLocation(loc)}
                        className="cursor-pointer"
                      >
                        {/* Pulse ring */}
                        <circle cx={cx} cy={cy} r="20" fill="none" stroke="rgba(245, 166, 35, 0.4)" strokeWidth="1">
                          <animate attributeName="r" from="15" to="30" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
                        </circle>
                        {/* Marker */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? "14" : "10"}
                          fill={loc.adminOnly ? 'rgba(255, 68, 68, 0.3)' : 'rgba(245, 166, 35, 0.3)'}
                          stroke={loc.adminOnly ? '#ff4444' : '#f5a623'}
                          strokeWidth="2"
                          className="transition-all duration-300"
                        />
                        <circle cx={cx} cy={cy} r="3" fill={loc.adminOnly ? '#ff4444' : '#f5a623'} />
                      </g>
                    );
                  })}
              </svg>

              {/* Cloud layer */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse 200px 60px at 30% 20%, rgba(255,255,255,0.04), transparent), radial-gradient(ellipse 150px 50px at 70% 15%, rgba(255,255,255,0.03), transparent)',
                }}
              />

              {/* Fog overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(180deg, transparent 60%, rgba(5, 7, 10, 0.4) 100%)',
                }}
              />
            </div>

            <div className="absolute inset-0 bg-ink-900" aria-hidden="true" />

            <HudCorners />
          </div>

        </div>
      </div>

      {/* Location cards */}
      <div className="relative z-10 px-4 md:px-8 pb-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleLocations.map((loc, i) => {
              const Icon = ICON_MAP[loc.icon] || Building2;
              return (
                <button
                  key={loc.id}
                  onClick={() => onNavigate(loc.section as AppView)}
                  onMouseEnter={() => setHoveredId(loc.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="tactical-card p-5 text-left group animate-fade-in-up corner-brackets"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-12 h-12 flex items-center justify-center ${loc.adminOnly ? 'bg-alert-500/10' : 'bg-neon-500/10'}`}>
                      <Icon size={24} className={loc.adminOnly ? 'text-alert-400' : 'text-neon-400'} />
                    </div>
                    <ChevronRight size={18} className="text-gray-600 group-hover:text-neon-400 group-hover:translate-x-1 transition-all" />
                  </div>
                  <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-1">{loc.name}</h3>
                  <p className="font-mono text-xs text-gray-500">{loc.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Location detail modal */}
      {selectedLocation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => setSelectedLocation(null)}
        >
          <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
          <div
            className="relative glass-panel clip-tactical-lg p-8 max-w-md w-full animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-14 h-14 flex items-center justify-center ${selectedLocation.adminOnly ? 'bg-alert-500/10' : 'bg-neon-500/10'}`}>
                {(() => {
                  const Icon = ICON_MAP[selectedLocation.icon] || Building2;
                  return <Icon size={28} className={selectedLocation.adminOnly ? 'text-alert-400' : 'text-neon-400'} />;
                })()}
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-white uppercase tracking-wider">{selectedLocation.name}</h3>
                <p className="font-mono text-xs text-tactical-300">{selectedLocation.description}</p>
              </div>
            </div>
            <p className="text-gray-400 font-heading text-base mb-6">
              Enter the {selectedLocation.name} to explore this section of the guild headquarters.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onNavigate(selectedLocation.section as AppView)}
                className="btn-neon flex-1 flex items-center justify-center gap-2"
              >
                Enter <ChevronRight size={16} />
              </button>
              <button onClick={() => setSelectedLocation(null)} className="btn-outline">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
