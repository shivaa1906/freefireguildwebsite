import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { GuildEvent } from '@/types';
import { guildApi } from '@/lib/api';
import { GridBackground, ParticleField, Vignette } from '@/components/effects/VisualEffects';
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, Users, MapPinned, Sparkles, Plus, X } from 'lucide-react';

const EMPTY_EVENT_DRAFT = {
  name: '',
  description: '',
  date: '',
  time: '',
  type: 'custom-match' as GuildEvent['type'],
  participantLimit: 20,
};

export function GuildEvents() {
  const { member, events } = useAuth();
  const [loading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(EMPTY_EVENT_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const canManage = member?.role === 'admin' || member?.role === 'coadmin';

  useEffect(() => {
    if (events.length > 0 && !selectedId) {
      setSelectedId(events[0].id);
    }
    if (events.length === 0) {
      setSelectedId(null);
    }
  }, [events, selectedId]);

  const selectedEvent = events.find((event) => event.id === selectedId) || null;

  const registerForSelected = async () => {
    if (!selectedEvent) return;
    try {
      await guildApi.registerForEvent(selectedEvent.id);
      setSelectedId(selectedEvent.id);
    } catch {
      setSelectedId(selectedEvent.id);
    }
  };

  const leaveSelected = async () => {
    if (!selectedEvent) return;
    try {
      await guildApi.leaveEvent(selectedEvent.id);
      setSelectedId(selectedEvent.id);
    } catch {
      setSelectedId(selectedEvent.id);
    }
  };

  const isRegistered = selectedEvent ? selectedEvent.participants.includes(member?.id || '') : false;

  const submitEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!member) return;
    if (!draft.name.trim() || !draft.description.trim() || !draft.date || !draft.time) {
      setFormError('Please complete all event fields before creating the event.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    const nextEvent: GuildEvent = {
      id: `event-${Date.now()}`,
      name: draft.name.trim(),
      type: draft.type,
      date: draft.date,
      time: draft.time,
      description: draft.description.trim(),
      participantLimit: Math.max(1, Number(draft.participantLimit) || 1),
      participants: [],
      status: 'upcoming',
      organizerId: member.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      registrationOpen: true,
    };

    try {
      await guildApi.save<GuildEvent>('events', nextEvent);
      setSelectedId(nextEvent.id);
      setShowCreate(false);
      setDraft(EMPTY_EVENT_DRAFT);
      window.location.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The event could not be created. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16">
      <GridBackground />
      <ParticleField count={30} />
      <Vignette />

      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-8 animate-fade-in-down">
            <div>
              <div className="hud-label mb-1">GUILD OPERATIONS · EVENT BOARD</div>
              <h1 className="section-title text-3xl md:text-4xl">Guild Events</h1>
            </div>
            {canManage && (
              <button onClick={() => setShowCreate(true)} className="btn-neon flex items-center gap-2">
                <Plus size={18} />
                New Event
              </button>
            )}
          </div>

          {loading && <div className="py-20 text-center font-mono text-xs uppercase text-gray-500">Loading events...</div>}

          {!loading && events.length === 0 && (
            <div className="glass-panel clip-tactical p-12 text-center">
              <CalendarDays size={36} className="mx-auto mb-4 text-gray-600" />
              <div className="font-mono text-xs uppercase tracking-widest text-gray-500">NO GUILD EVENTS FOUND</div>
              <p className="mt-3 text-gray-400 font-heading text-sm">Create your first guild event to bring the community together.</p>
              {canManage && (
                <button onClick={() => setShowCreate(true)} className="btn-neon mt-6 inline-flex items-center gap-2">
                  <Plus size={18} />
                  Create Event
                </button>
              )}
            </div>
          )}

          {!loading && events.length > 0 && (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <aside className="space-y-4">
                {events.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setSelectedId(event.id)}
                    className={`w-full text-left glass-panel clip-tactical p-4 transition-all ${selectedEvent?.id === event.id ? 'border-neon-500/50 bg-neon-500/5' : 'border-ink-600/50'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-neon-300">{event.type}</div>
                        <h2 className="mt-2 font-heading font-bold text-white text-lg">{event.name}</h2>
                      </div>
                      <ChevronRight size={16} className="text-gray-500" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase text-gray-500">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {event.date}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {event.time}</span>
                    </div>
                  </button>
                ))}
              </aside>

              <section className="glass-panel clip-tactical p-6">
                {selectedEvent ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="hud-label mb-1">EVENT DETAIL</div>
                        <h2 className="section-title text-2xl md:text-3xl">{selectedEvent.name}</h2>
                      </div>
                      <span className="inline-flex items-center gap-2 border border-ink-600 bg-ink-800/60 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-neon-300">
                        <Sparkles size={12} /> {selectedEvent.status}
                      </span>
                    </div>

                    <p className="mt-5 font-heading text-sm leading-relaxed text-gray-300">{selectedEvent.description}</p>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <InfoTile icon={CalendarDays} label="Date" value={selectedEvent.date} />
                      <InfoTile icon={Clock3} label="Time" value={selectedEvent.time} />
                      <InfoTile icon={Users} label="Participants" value={`${selectedEvent.participants.length}/${selectedEvent.participantLimit}`} />
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      {selectedEvent.registrationOpen && member && (
                        <button
                          onClick={isRegistered ? leaveSelected : registerForSelected}
                          className={isRegistered ? 'btn-outline' : 'btn-neon'}
                        >
                          {isRegistered ? 'Leave Event' : 'Register'}
                        </button>
                      )}
                      {selectedEvent.result && (
                        <div className="inline-flex items-center gap-2 border border-success-500/40 bg-success-500/10 px-3 py-2 font-mono text-[10px] uppercase text-success-300">
                          <CheckCircle2 size={12} /> winner confirmed
                        </div>
                      )}
                    </div>

                    {selectedEvent.result && (
                      <div className="mt-6 border border-ink-600 bg-ink-800/40 p-4">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-2">Result</div>
                        <div className="font-heading text-white">{selectedEvent.result.summary || 'Event result recorded.'}</div>
                      </div>
                    )}

                    <div className="mt-6 border-t border-ink-600 pt-5">
                      <div className="flex items-center gap-2 mb-3">
                        <MapPinned size={16} className="text-neon-400" />
                        <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">Registered members</div>
                      </div>
                      <div className="space-y-2">
                        {selectedEvent.participants.length === 0 ? (
                          <div className="font-mono text-xs text-gray-500">No registrations yet.</div>
                        ) : (
                          selectedEvent.participants.map((participantId) => (
                            <div key={participantId} className="flex items-center justify-between border-b border-ink-700 pb-2 font-heading text-sm text-tactical-200">
                              <span>{participantId}</span>
                              <span className="font-mono text-[10px] uppercase text-success-400">Registered</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center font-mono text-xs uppercase tracking-widest text-gray-500">Select an event</div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
          <form onSubmit={submitEvent} className="relative glass-panel clip-tactical-lg p-8 max-w-2xl w-full space-y-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display font-bold text-xl uppercase tracking-wider text-white">Create Guild Event</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white" aria-label="Close create event form">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Event Name</label>
              <input
                required
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Guild raid night"
                className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Description</label>
              <textarea
                required
                rows={4}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Share details for the event, who it is for, and any important notes."
                className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none resize-none"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Date</label>
                <input
                  required
                  type="date"
                  value={draft.date}
                  onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                  className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Time</label>
                <input
                  required
                  type="time"
                  value={draft.time}
                  onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
                  className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Event Type</label>
                <select
                  value={draft.type}
                  onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as GuildEvent['type'] }))}
                  className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none"
                >
                  <option value="custom-match">Custom Match</option>
                  <option value="practice">Practice</option>
                  <option value="scrim">Scrim</option>
                  <option value="recruitment">Recruitment</option>
                  <option value="tournament">Tournament</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Participant Limit</label>
                <input
                  min={1}
                  type="number"
                  value={draft.participantLimit}
                  onChange={(event) => setDraft((current) => ({ ...current, participantLimit: Number(event.target.value) || 1 }))}
                  className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none"
                />
              </div>
            </div>

            {formError && <div className="border border-alert-500/40 bg-alert-500/10 px-4 py-3 font-mono text-xs uppercase text-alert-400">{formError}</div>}

            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting} className="btn-neon disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? 'Creating...' : 'Create Event'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-outline">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="border border-ink-600 bg-ink-800/30 p-3">
      <Icon size={15} className="mb-2 text-neon-400" />
      <div className="font-mono text-[10px] uppercase text-gray-500">{label}</div>
      <div className="mt-1 font-heading text-xs text-white">{value}</div>
    </div>
  );
}
