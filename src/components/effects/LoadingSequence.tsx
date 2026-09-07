import { useEffect, useState } from 'react';
import { GridBackground, ParticleField, ScanLines, Vignette } from '@/components/effects/VisualEffects';

interface LoadingSequenceProps {
  onComplete: () => void;
}

export function LoadingSequence({ onComplete }: LoadingSequenceProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delays = prefersReducedMotion
      ? [100, 100, 100, 100, 100]
      : [500, 1200, 1800, 2400, 3000];

    const timers = delays.map((delay, i) => setTimeout(() => setPhase(i), delay));
    const completeTimer = setTimeout(onComplete, prefersReducedMotion ? 600 : 3800);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-ink-900 flex items-center justify-center overflow-hidden">
      <GridBackground />
      <ParticleField count={80} />
      <ScanLines />
      <Vignette />

      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Phase 0: Logo */}
        {phase >= 0 && (
          <div className="flex flex-col items-center gap-4 animate-scale-in">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 border-2 border-neon-500/60 rotate-45 animate-spin-slow" />
              <div className="absolute inset-2 border border-tactical-400/40 rotate-45" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display font-black text-3xl text-neon-400 text-glow">FF</span>
              </div>
            </div>
            <div className="font-display font-bold text-sm tracking-[0.4em] text-tactical-200 uppercase">
              Free Fire Guild
            </div>
          </div>
        )}

        {/* Phase 1: Coordinates */}
        {phase >= 1 && (
          <div className="font-mono text-xs text-tactical-300/60 animate-fade-in space-y-1">
            <div>COORD: 25.0443° N, 121.5220° E</div>
            <div>SECTOR: BERMUDA — GRID 7A</div>
            <div>STATUS: <span className="text-neon-400">ESTABLISHING SECURE CONNECTION</span></div>
          </div>
        )}

        {/* Phase 2: Scan animation */}
        {phase >= 2 && (
          <div className="w-64 h-1 bg-ink-600 rounded-full overflow-hidden animate-fade-in">
            <div
              className="h-full bg-gradient-to-r from-neon-500 to-neon-300 rounded-full"
              style={{ width: phase >= 3 ? '100%' : '60%', transition: 'width 1s ease-out' }}
            />
          </div>
        )}

        {/* Phase 3: Access Granted */}
        {phase >= 3 && (
          <div className="animate-scale-in">
            <div className="font-display font-black text-4xl md:text-5xl text-neon-400 text-glow tracking-wider">
              ACCESS GRANTED
            </div>
          </div>
        )}

        {/* Phase 4: Enter prompt */}
        {phase >= 4 && (
          <div className="font-mono text-sm text-tactical-200 animate-fade-in animate-blink">
            ENTERING GUILD LOBBY...
          </div>
        )}
      </div>

      {/* Corner decorations */}
      <div className="absolute top-8 left-8 w-16 h-16 border-t-2 border-l-2 border-neon-500/30" />
      <div className="absolute top-8 right-8 w-16 h-16 border-t-2 border-r-2 border-neon-500/30" />
      <div className="absolute bottom-8 left-8 w-16 h-16 border-b-2 border-l-2 border-neon-500/30" />
      <div className="absolute bottom-8 right-8 w-16 h-16 border-b-2 border-r-2 border-neon-500/30" />
    </div>
  );
}
