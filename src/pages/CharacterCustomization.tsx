import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { CharacterConfig } from '@/types';
import { GridBackground, ParticleField, ScanLines, Vignette, HudCorners } from '@/components/effects/VisualEffects';
import { mockCustomizationItems } from '@/data/mockData';
import { Shirt, Check, Save, RotateCw, Sparkles, User, Eye, Zap } from 'lucide-react';

type Tab = 'appearance' | 'outfit' | 'accessories' | 'effects';

const TABS: { id: Tab; label: string; icon: typeof Shirt }[] = [
  { id: 'appearance', label: 'Appearance', icon: User },
  { id: 'outfit', label: 'Outfit', icon: Shirt },
  { id: 'accessories', label: 'Accessories', icon: Eye },
  { id: 'effects', label: 'Effects', icon: Zap },
];

export function CharacterCustomization() {
  const { member, updateCharacter } = useAuth();
  const [config, setConfig] = useState<CharacterConfig>(member?.character || getDefaultConfig());
  const [activeTab, setActiveTab] = useState<Tab>('outfit');
  const [saveFlash, setSaveFlash] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setRotation((r) => r + 0.3);
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const updateField = (category: keyof CharacterConfig, subcategory: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      [category]: { ...prev[category], [subcategory]: value },
    }));
  };

  const handleSave = () => {
    updateCharacter(config);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
  };

  const availableItems = mockCustomizationItems.filter(
    (item) => item.category === activeTab && item.enabled
  );

  const subcategories = [...new Set(availableItems.map((item) => item.subcategory))];

  const rarityColors: Record<string, string> = {
    standard: 'border-tactical-600 text-tactical-200',
    special: 'border-neon-500/50 text-neon-300',
    admin: 'border-alert-500/50 text-alert-400',
    event: 'border-success-500/50 text-success-400',
  };

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16" ref={containerRef} onMouseMove={handleMouseMove}>
      <GridBackground />
      <ParticleField count={40} />
      <ScanLines />
      <Vignette />

      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6 animate-fade-in-down">
            <div className="hud-label mb-1">ARMORY · CHARACTER CUSTOMIZATION</div>
            <h1 className="section-title text-3xl md:text-4xl">Customize Your Loadout</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Character preview */}
            <div className="lg:col-span-5">
              <div className="relative glass-panel clip-tactical-lg overflow-hidden aspect-[3/4] sticky top-24">
                <div
                  className="absolute inset-0"
                  style={{ background: 'radial-gradient(ellipse at center, rgba(245, 166, 35, 0.08) 0%, rgba(10, 14, 20, 0.95) 70%)' }}
                />
                <div className="absolute inset-0 bg-tactical-grid bg-grid-50 opacity-20" />
                <HudCorners />

                {/* Character */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: '800px' }}>
                  <div
                    className="relative"
                    style={{
                      transform: `rotateY(${rotation + mousePos.x * 15}deg) rotateX(${mousePos.y * -10}deg)`,
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.1s ease-out',
                    }}
                  >
                    <div className="absolute inset-0 -m-12 border border-neon-500/15 rotate-45" />
                    <div className="absolute inset-0 -m-16 border border-tactical-500/10 rotate-45" />
                    {config.effects.aura !== 'None' && (
                      <div
                        className="absolute inset-0 -m-8 rounded-full animate-pulse-glow"
                        style={{ background: getAuraColor(config.effects.aura), filter: 'blur(30px)', opacity: 0.25 }}
                      />
                    )}
                    <img
                      src={member?.avatar}
                      onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member?.displayName || 'Discord user')}&background=f5a623&color=111827&size=200`; }}
                      alt="Character preview"
                      className="w-40 h-40 md:w-48 md:h-48 rounded-full object-cover border-2 border-neon-500/40"
                    />
                  </div>
                </div>

                {/* Rotation indicator */}
                <div className="absolute top-4 left-4 flex items-center gap-2 font-mono text-xs text-tactical-300">
                  <RotateCw size={14} className="animate-spin-slow" />
                  <span>3D PREVIEW</span>
                </div>

                {/* Config summary */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-ink-900 via-ink-900/90 to-transparent space-y-1">
                  <div className="font-mono text-xs text-gray-500 uppercase tracking-widest mb-2">Current Loadout</div>
                  <div className="grid grid-cols-2 gap-1 font-mono text-xs">
                    <div className="text-tactical-300">{config.outfit.top}</div>
                    <div className="text-tactical-300">{config.outfit.headwear}</div>
                    <div className="text-tactical-300">{config.outfit.bottom}</div>
                    <div className="text-tactical-300">{config.outfit.footwear}</div>
                  </div>
                </div>

                {/* Save flash */}
                {saveFlash && (
                  <div className="absolute inset-0 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-3 border-2 border-success-500 rotate-45 flex items-center justify-center">
                        <Check size={28} className="text-success-400 -rotate-45" />
                      </div>
                      <div className="font-display font-bold text-xl text-success-400 uppercase tracking-wider">Loadout Saved</div>
                      <div className="font-mono text-xs text-tactical-300 mt-1">Your character has been updated</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Customization panel */}
            <div className="lg:col-span-7">
              {/* Tabs */}
              <div className="flex gap-2 mb-6 animate-fade-in-up">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 font-heading font-semibold text-sm uppercase tracking-wider transition-all clip-tactical ${
                        activeTab === tab.id
                          ? 'bg-neon-500/15 text-neon-300 border border-neon-500/40'
                          : 'text-gray-500 border border-tactical-700/30 hover:text-tactical-200'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Options */}
              <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                {subcategories.map((subcat) => {
                  const items = availableItems.filter((item) => item.subcategory === subcat);
                  const currentValue = (config[activeTab] as Record<string, string>)[subcat];
                  return (
                    <div key={subcat} className="glass-panel clip-tactical p-5">
                      <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-4 capitalize">
                        {subcat}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {items.map((item) => {
                          const isSelected = currentValue === item.name;
                          return (
                            <button
                              key={item.id}
                              onClick={() => updateField(activeTab, subcat, item.name)}
                              className={`relative p-3 text-left transition-all clip-tactical border ${
                                isSelected
                                  ? 'bg-neon-500/15 border-neon-500/50'
                                  : `bg-ink-800/50 ${rarityColors[item.rarity]} hover:bg-ink-700/50`
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5">
                                  <Check size={14} className="text-neon-400" />
                                </div>
                              )}
                              <div className="font-heading font-semibold text-sm text-white mb-1">{item.name}</div>
                              <div className={`font-mono text-[10px] uppercase tracking-wider ${rarityColors[item.rarity].split(' ')[1]}`}>
                                {item.rarity}
                              </div>
                            </button>
                          );
                        })}
                        {/* "None" option for accessories and effects */}
                        {(activeTab === 'accessories' || activeTab === 'effects') && (
                          <button
                            onClick={() => updateField(activeTab, subcat, 'None')}
                            className={`p-3 text-left transition-all clip-tactical border ${
                              currentValue === 'None'
                                ? 'bg-neon-500/15 border-neon-500/50'
                                : 'bg-ink-800/50 border-ink-600 text-gray-500 hover:bg-ink-700/50'
                            }`}
                          >
                            <div className="font-heading font-semibold text-sm text-gray-400 mb-1">None</div>
                            <div className="font-mono text-[10px] uppercase tracking-wider text-gray-600">No item</div>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Save button */}
              <div className="mt-6 flex items-center gap-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                <button onClick={handleSave} className="btn-neon flex items-center gap-2">
                  <Save size={18} />
                  Save Loadout
                </button>
                <button
                  onClick={() => setConfig(getDefaultConfig())}
                  className="btn-outline flex items-center gap-2"
                >
                  <RotateCw size={16} />
                  Reset
                </button>
                <div className="flex items-center gap-2 font-mono text-xs text-gray-500 ml-auto">
                  <Sparkles size={14} className="text-neon-400" />
                  <span>Changes preview instantly</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDefaultConfig(): CharacterConfig {
  return {
    appearance: { base: 'Tactical', hairstyle: 'Crew Cut', face: 'Standard', skinTone: 'Tan' },
    outfit: { headwear: 'Combat Helmet', top: 'Tactical Vest', bottom: 'Cargo Pants', footwear: 'Combat Boots' },
    accessories: { mask: 'None', glasses: 'Tactical Goggles', back: 'None' },
    effects: { aura: 'None', cardEffect: 'Standard', entranceAnimation: 'Default' },
  };
}

function getAuraColor(aura: string): string {
  if (aura.includes('Frost')) return '#3a8fb8';
  if (aura.includes('Golden')) return '#f5a623';
  if (aura.includes('Inferno')) return '#ff4444';
  return '#f5a623';
}
