import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { guildApi } from '@/lib/api';
import type { Tournament, TournamentBracket, TournamentMatch, TournamentParticipant, TournamentResult, TournamentStanding, TournamentTeam } from '@/types';
import { GridBackground, ParticleField, Vignette } from '@/components/effects/VisualEffects';
import { Calendar, CheckCircle2, ChevronRight, Clock, Medal, Plus, ShieldCheck, Trophy, Users, X } from 'lucide-react';

type MatchPage = { items: TournamentMatch[]; page: number; limit: number; total: number; pages: number };
const statusLabels: Record<Tournament['status'], string> = { draft: 'Draft', registration_open: 'Registration Open', registration_closed: 'Registration Closed', active: 'Active', completed: 'Completed', cancelled: 'Cancelled' };
const emptyCreateDraft = { eventId: '', name: '', description: '', gameMode: 'Squad', teamSize: 4, maxTeams: 8, registrationOpenAt: '', registrationCloseAt: '', startAt: '', endAt: '' };

export function Tournaments() {
  const { member, members, events } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<TournamentParticipant[]>([]);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [bracket, setBracket] = useState<TournamentBracket | null>(null);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [results, setResults] = useState<Record<string, TournamentResult[]>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamMembers, setTeamMembers] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState(emptyCreateDraft);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const canManage = member?.role === 'admin' || member?.role === 'coadmin';
  const tournamentEvents = useMemo(() => events.filter((event) => event.type === 'tournament'), [events]);

  const loadTournaments = async () => {
    setLoading(true);
    setError('');
    try {
      setTournaments(await guildApi.tournaments<Tournament>());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Tournament data could not be loaded.');
      setTournaments([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (tournament: Tournament) => {
    setSelected(tournament);
    setDetailLoading(true);
    setActionError('');
    try {
      const [participantRecords, teamRecords, bracketRecord, matchPage, standingPage] = await Promise.all([
        guildApi.tournamentParticipants<TournamentParticipant>(tournament.id),
        guildApi.tournamentTeams<TournamentTeam>(tournament.id),
        guildApi.tournamentBracket<TournamentBracket>(tournament.id).catch(() => null),
        guildApi.tournamentMatches<MatchPage>(tournament.id),
        guildApi.tournamentStandings<{ items: TournamentStanding[] }>(tournament.id),
      ]);
      setParticipants(participantRecords);
      setTeams(teamRecords);
      setBracket(bracketRecord);
      setMatches(matchPage.items || []);
      setStandings(standingPage.items || []);
      const officialResults = await Promise.all((matchPage.items || []).map(async (match) => [match.id, await guildApi.tournamentMatchResults<TournamentResult>(tournament.id, match.id)] as const));
      setResults(Object.fromEntries(officialResults));
    } catch (loadError) {
      setActionError(loadError instanceof Error ? loadError.message : 'Tournament details could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadTournaments();
  }, []);

  const participantForMember = selected && member ? participants.find((participant) => participant.memberId === member.id) : undefined;
  const registered = participantForMember?.status === 'registered';
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const memberName = (id: string) => members.find((item) => item.id === id)?.displayName || 'Guild member';
  const teamNameFor = (id: string | null) => id ? teamById.get(id)?.name || 'Team' : 'BYE / TBD';

  const runAction = async (action: () => Promise<unknown>) => {
    if (!selected) return;
    setBusy(true);
    setActionError('');
    try {
      await action();
      await loadDetails(selected);
      await loadTournaments();
    } catch (actionFailure) {
      setActionError(actionFailure instanceof Error ? actionFailure.message : 'Tournament action failed.');
    } finally {
      setBusy(false);
    }
  };

  const createTeam = () => {
    if (!selected || !teamName.trim()) return;
    const ids = teamMembers.split(',').map((id) => id.trim()).filter(Boolean);
    void runAction(() => guildApi.createTournamentTeam(selected.id, { name: teamName.trim(), memberIds: ids.length ? ids : [member?.id] }));
    setTeamName('');
    setTeamMembers('');
  };

  const submitTournament = async () => {
    if (!createDraft.eventId || !createDraft.name.trim() || !createDraft.description.trim() || !createDraft.registrationOpenAt || !createDraft.registrationCloseAt || !createDraft.startAt || !createDraft.endAt) {
      setCreateError('Please complete all required tournament fields and choose a linked guild event.');
      return;
    }

    setCreateSubmitting(true);
    setCreateError('');
    setSuccessMessage('');

    try {
      const created = await guildApi.createTournament<Tournament>({
        eventId: createDraft.eventId,
        name: createDraft.name.trim(),
        description: createDraft.description.trim(),
        format: 'single_elimination',
        gameMode: createDraft.gameMode.trim() || 'Squad',
        teamSize: Number(createDraft.teamSize) || 4,
        maxTeams: Number(createDraft.maxTeams) || 8,
        registrationOpenAt: createDraft.registrationOpenAt,
        registrationCloseAt: createDraft.registrationCloseAt,
        startAt: createDraft.startAt,
        endAt: createDraft.endAt,
        scoringRules: {},
        rankingIntegration: { enabled: false },
      });

      setShowCreate(false);
      setCreateDraft(emptyCreateDraft);
      setSuccessMessage('Tournament created successfully.');
      await loadTournaments();
      await loadDetails(created);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create tournament. Please check the details and try again.');
    } finally {
      setCreateSubmitting(false);
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
              <div className="hud-label mb-1">COMPETITIVE OPERATIONS · TOURNAMENT CONTROL</div>
              <h1 className="section-title text-3xl md:text-4xl">Tournaments</h1>
            </div>
            {canManage && (
              <button onClick={() => setShowCreate(true)} className="btn-neon flex items-center gap-2">
                <Plus size={18} />
                New Tournament
              </button>
            )}
          </div>
          {successMessage && <div className="mb-5 border border-success-500/40 bg-success-500/10 px-4 py-3 font-mono text-xs uppercase text-success-300">{successMessage}</div>}
          {error && <div className="mb-5 border border-alert-500/40 bg-alert-500/10 px-4 py-3 font-mono text-xs text-alert-300">{error}</div>}
          {loading && <div className="py-20 text-center font-mono text-xs uppercase text-gray-500">Loading server tournaments...</div>}
          {!loading && tournaments.length === 0 && (
            <div className="glass-panel clip-tactical p-12 text-center">
              <Trophy size={36} className="mx-auto mb-4 text-gray-600" />
              <div className="font-mono text-xs uppercase tracking-widest text-gray-500">NO TOURNAMENTS FOUND</div>
              <p className="mt-3 text-gray-400 font-heading text-sm">Create your first tournament to get started.</p>
              {canManage && (
                <button onClick={() => setShowCreate(true)} className="btn-neon mt-6 inline-flex items-center gap-2">
                  <Plus size={18} />
                  Create Tournament
                </button>
              )}
            </div>
          )}
          {!loading && tournaments.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {tournaments.map((tournament) => (
                <button key={tournament.id} onClick={() => void loadDetails(tournament)} className="tactical-card corner-brackets p-5 text-left transition-colors hover:border-neon-500/50">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-alert-400">Single Elimination</div>
                      <h2 className="mt-1 font-display text-xl font-bold text-white">{tournament.name}</h2>
                    </div>
                    <ChevronRight size={18} className="text-gray-600" />
                  </div>
                  <p className="mt-3 line-clamp-2 font-heading text-sm text-gray-400">{tournament.description}</p>
                  <div className="mt-5 flex flex-wrap gap-3 font-mono text-[10px] uppercase text-gray-500">
                    <span className="text-neon-300">{statusLabels[tournament.status]}</span>
                    <span>{tournament.gameMode}</span>
                    <span>{tournament.teamSize} per team</span>
                    <span>{tournament.maxTeams} teams</span>
                  </div>
                  <div className="mt-4 flex items-center gap-2 border-t border-ink-600 pt-3 font-mono text-xs text-gray-500">
                    <Calendar size={13} />
                    Starts {new Date(tournament.startAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
          <div className="relative glass-panel clip-tactical-lg p-6 md:p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <div className="hud-label mb-1">TOURNAMENT CREATION</div>
                <h2 className="font-display font-bold text-2xl uppercase tracking-wider text-white">Create Tournament</h2>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white" aria-label="Close create tournament form">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <section className="space-y-3 rounded border border-ink-600 bg-ink-900/40 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Basic Information</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Tournament Name</label>
                    <input value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none" placeholder="Weekend showdown" />
                  </div>
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Associated Guild Event</label>
                    <select value={createDraft.eventId} onChange={(event) => setCreateDraft((current) => ({ ...current, eventId: event.target.value }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none">
                      <option value="">Select guild event</option>
                      {tournamentEvents.map((event) => (
                        <option key={event.id} value={event.id}>{event.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Description</label>
                  <textarea rows={3} value={createDraft.description} onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none resize-none" placeholder="Describe the tournament and its purpose." />
                </div>
              </section>

              <section className="space-y-3 rounded border border-ink-600 bg-ink-900/40 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Game Settings</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Game Mode</label>
                    <input value={createDraft.gameMode} onChange={(event) => setCreateDraft((current) => ({ ...current, gameMode: event.target.value }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none" placeholder="Squad" />
                  </div>
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Format</label>
                    <div className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading">Single Elimination</div>
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded border border-ink-600 bg-ink-900/40 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Team Settings</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Team Size</label>
                    <input type="number" min={1} max={4} value={createDraft.teamSize} onChange={(event) => setCreateDraft((current) => ({ ...current, teamSize: Number(event.target.value) || 4 }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Maximum Teams</label>
                    <input type="number" min={2} max={256} value={createDraft.maxTeams} onChange={(event) => setCreateDraft((current) => ({ ...current, maxTeams: Number(event.target.value) || 8 }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none" />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded border border-ink-600 bg-ink-900/40 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Registration</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Registration Opens</label>
                    <input type="datetime-local" value={createDraft.registrationOpenAt} onChange={(event) => setCreateDraft((current) => ({ ...current, registrationOpenAt: event.target.value }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Registration Closes</label>
                    <input type="datetime-local" value={createDraft.registrationCloseAt} onChange={(event) => setCreateDraft((current) => ({ ...current, registrationCloseAt: event.target.value }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none" />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded border border-ink-600 bg-ink-900/40 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Schedule</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Tournament Starts</label>
                    <input type="datetime-local" value={createDraft.startAt} onChange={(event) => setCreateDraft((current) => ({ ...current, startAt: event.target.value }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-500">Tournament Ends</label>
                    <input type="datetime-local" value={createDraft.endAt} onChange={(event) => setCreateDraft((current) => ({ ...current, endAt: event.target.value }))} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none" />
                  </div>
                </div>
              </section>

              {createError && <div className="border border-alert-500/40 bg-alert-500/10 px-4 py-3 font-mono text-xs uppercase text-alert-400">{createError}</div>}

              <div className="flex items-center gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-outline">Cancel</button>
                <button type="button" disabled={createSubmitting} onClick={() => void submitTournament()} className="btn-neon disabled:cursor-not-allowed disabled:opacity-60">
                  {createSubmitting ? 'Creating...' : 'Create Tournament'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-900/95 backdrop-blur-md">
          <div className="min-h-screen px-4 py-6 md:px-10 md:py-10">
            <div className="mx-auto max-w-7xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="hud-label mb-1">TOURNAMENT DOSSIER · {statusLabels[selected.status]}</div>
                  <h2 className="section-title text-2xl md:text-4xl">{selected.name}</h2>
                  <p className="mt-2 max-w-3xl font-heading text-sm text-gray-400">{selected.description}</p>
                </div>
                <button onClick={() => setSelected(null)} className="btn-outline" aria-label="Close tournament details"><X size={16} /></button>
              </div>
              {actionError && <div className="mb-5 border border-alert-500/40 bg-alert-500/10 px-4 py-3 font-mono text-xs text-alert-300">{actionError}</div>}
              {detailLoading ? (
                <div className="py-20 text-center font-mono text-xs uppercase text-gray-500">Loading tournament records...</div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <InfoTile icon={Calendar} label="Registration closes" value={new Date(selected.registrationCloseAt).toLocaleString()} />
                    <InfoTile icon={Clock} label="Starts" value={new Date(selected.startAt).toLocaleString()} />
                    <InfoTile icon={Users} label="Teams" value={`${teams.filter((team) => team.status === 'active').length} / ${selected.maxTeams}`} />
                    <InfoTile icon={Medal} label="Format" value="Single elimination" />
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                    <section className="glass-panel clip-tactical p-5">
                      <SectionHeading icon={Users} title="Registration" />
                      <div className="mb-4 font-mono text-xs text-gray-500">{participants.filter((item) => item.status === 'registered').length} registered participants</div>
                      {member && selected.status === 'registration_open' && (
                        <button
                          disabled={busy}
                          onClick={() => void runAction(() => registered ? guildApi.withdrawFromTournament(selected.id) : guildApi.registerForTournament(selected.id))}
                          className={`${registered ? 'btn-outline' : 'btn-neon'} w-full disabled:opacity-50`}
                        >
                          {busy ? 'Updating...' : registered ? 'Withdraw registration' : 'Register for tournament'}
                        </button>
                      )}
                      <div className="mt-5 space-y-2">
                        {participants.filter((item) => item.status === 'registered').map((participant) => (
                          <div key={participant.id} className="flex items-center justify-between border-b border-ink-700 pb-2 font-heading text-sm text-tactical-200">
                            <span>{memberName(participant.memberId)}</span>
                            <span className="font-mono text-[10px] uppercase text-success-400">Registered</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="glass-panel clip-tactical p-5">
                      <SectionHeading icon={ShieldCheck} title="Teams" />
                      <div className="space-y-2">
                        {teams.filter((team) => team.status === 'active').map((team) => (
                          <div key={team.id} className="border border-ink-600 bg-ink-800/30 p-3">
                            <div className="flex items-center justify-between">
                              <span className="font-heading font-semibold text-white">{team.name}</span>
                              <span className="font-mono text-[10px] uppercase text-gray-500">Captain {memberName(team.captainMemberId)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {team.memberIds.map((id) => (
                                <span key={id} className="border border-ink-600 px-2 py-1 font-mono text-[10px] text-gray-400">{memberName(id)}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {teams.length === 0 && <div className="font-mono text-xs text-gray-500">No teams created yet.</div>}
                      </div>

                      {member && ['registration_open', 'registration_closed'].includes(selected.status) && (
                        <div className="mt-5 border-t border-ink-600 pt-4">
                          <div className="hud-label mb-2">CREATE TEAM</div>
                          <div className="grid gap-2">
                            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" className="bg-ink-900/60 px-3 py-2 font-heading text-white" />
                            <input value={teamMembers} onChange={(event) => setTeamMembers(event.target.value)} placeholder="Member IDs, comma separated" className="bg-ink-900/60 px-3 py-2 font-heading text-white" />
                            <button disabled={busy || !teamName.trim()} onClick={createTeam} className="btn-outline inline-flex items-center justify-center gap-2 disabled:opacity-50">
                              <Plus size={15} /> Create team
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  </div>

                  <section className="glass-panel clip-tactical p-5">
                    <SectionHeading icon={Trophy} title="Official bracket and schedule" />
                    {!bracket && <div className="font-mono text-xs text-gray-500">Official bracket has not been generated.</div>}
                    {bracket && (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {matches.map((match) => (
                          <div key={match.id} className="border border-ink-600 bg-ink-800/30 p-3">
                            <div className="flex items-center justify-between font-mono text-[10px] uppercase text-gray-500">
                              <span>Round {match.round} · Match {match.matchNumber}</span>
                              <span className={match.status === 'completed' ? 'text-success-400' : match.status === 'disputed' ? 'text-alert-400' : 'text-neon-300'}>{match.status}</span>
                            </div>
                            <div className="mt-3 space-y-1 font-heading text-sm text-white">
                              <div>{teamNameFor(match.participantA)} {match.winnerId === match.participantA && '· WINNER'}</div>
                              <div>{teamNameFor(match.participantB)} {match.winnerId === match.participantB && '· WINNER'}</div>
                            </div>
                            {match.scheduledAt && (
                              <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-gray-500">
                                <Clock size={12} /> {new Date(match.scheduledAt).toLocaleString()}
                              </div>
                            )}
                            {results[match.id]?.filter((result) => result.status === 'verified').map((result) => (
                              <div key={result.id} className="mt-3 flex items-center gap-2 border-t border-ink-600 pt-2 font-mono text-[10px] text-success-400">
                                <CheckCircle2 size={12} /> Official {result.scoreA} - {result.scoreB}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="glass-panel clip-tactical p-5">
                    <SectionHeading icon={Medal} title="Server standings" />
                    {standings.length === 0 ? (
                      <div className="font-mono text-xs text-gray-500">No official standings yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {standings.map((standing, index) => (
                          <div key={standing.id} className="grid grid-cols-[2rem_1fr_repeat(3,auto)] items-center gap-3 border-b border-ink-700 pb-2 font-mono text-xs">
                            <span className="text-neon-300">#{standing.placement || index + 1}</span>
                            <span className="font-heading text-sm text-white">{teamNameFor(standing.teamId)}</span>
                            <span className="text-success-400">W {standing.wins}</span>
                            <span className="text-alert-300">L {standing.losses}</span>
                            <span className="text-gray-500">P {standing.matchesPlayed}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: typeof Trophy; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon size={18} className="text-neon-400" />
      <h3 className="font-heading font-bold uppercase tracking-wider text-white">{title}</h3>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="border border-ink-600 bg-ink-800/30 p-3">
      <Icon size={15} className="mb-2 text-neon-400" />
      <div className="font-mono text-[10px] uppercase text-gray-500">{label}</div>
      <div className="mt-1 font-heading text-xs text-white">{value}</div>
    </div>
  );
}
