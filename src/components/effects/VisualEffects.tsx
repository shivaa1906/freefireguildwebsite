import { useEffect, useRef, type ReactNode } from 'react';

interface ParticleFieldProps {
  count?: number;
  className?: string;
}

export function ParticleField({ count = 50, className = '' }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let animationId: number;
    const particles: Array<{ x: number; y: number; vx: number; vy: number; size: number; opacity: number }> = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 166, 35, ${p.opacity})`;
        ctx.fill();
      });
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [count]);

  return <canvas ref={canvasRef} className={`particle-field absolute inset-0 pointer-events-none ${className}`} />;
}

export function GridBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 bg-tactical-grid bg-grid-50 animate-grid-move pointer-events-none ${className}`} />
  );
}

export function ScanLines({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-neon-500/40 to-transparent animate-scan-line" />
      <div
        className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-tactical-300/30 to-transparent animate-scan-line"
        style={{ animationDelay: '1s' }}
      />
    </div>
  );
}

export function Vignette({ className = '' }: { className?: string }) {
  return (
    <div
      className={`vignette-overlay absolute inset-0 pointer-events-none ${className}`}
      style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(5, 7, 10, 0.8) 100%)' }}
    />
  );
}

export function HudCorners({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {[
        'top-0 left-0 border-t-2 border-l-2',
        'top-0 right-0 border-t-2 border-r-2',
        'bottom-0 left-0 border-b-2 border-l-2',
        'bottom-0 right-0 border-b-2 border-r-2',
      ].map((pos, i) => (
        <div key={i} className={`absolute ${pos} w-6 h-6 border-neon-500/40`} />
      ))}
    </div>
  );
}

export function AnimatedNumber({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      el.textContent = value + suffix;
      return;
    }

    let current = 0;
    const duration = 1500;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      current = Math.floor(value * eased);
      el.textContent = current + suffix;
      if (progress < 1) requestAnimationFrame(animate);
      else el.textContent = value + suffix;
    };
    requestAnimationFrame(animate);
  }, [value, suffix]);

  return <span ref={ref} className={className}>0{suffix}</span>;
}

export function FadeInWrapper({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div
      className={`opacity-0 animate-fade-in-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
