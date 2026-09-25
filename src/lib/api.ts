export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const API_BASE = `${BACKEND_URL}/api`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(errorBody?.error || `API request failed: ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

async function requestHealth() {
  return request<{ database: boolean; status: string }>('/health');
}

export const guildApi = {
  deleteAccount: () => request<void>('/auth/delete-account', { method: 'POST' }),
  health: requestHealth,
  guildProfile: <T>() => request<T>('/guild-profile'),
  refreshGuildProfile: <T>() => request<T>('/guild-profile/refresh', { method: 'POST' }),
  saveHlGamingApiKey: (memberId: string, apiKey: string) => request<{ saved: boolean; hasHlGamingApiKey: boolean }>(`/members/${memberId}/hl-gaming-key`, { method: 'POST', body: JSON.stringify({ apiKey }) }),
  adminHlGamingKeys: <T>() => request<T>('/admin/hl-gaming-keys'),
  memberProfile: <T>(memberId: string) => request<T>(`/members/${memberId}/profile`),
  updateMemberProfile: <T>(memberId: string, value: Partial<T>) => request<T>(`/members/${memberId}/profile`, { method: 'PATCH', body: JSON.stringify(value) }),
  saveHlGamingRoleKey: (role: string, apiKey: string) => request<{ role: string; key: { configured: boolean; key: string | null; source: string } }>('/admin/hl-gaming-role-key', { method: 'POST', body: JSON.stringify({ role, apiKey }) }),
  removeHlGamingRoleKey: (role: string) => request<void>(`/admin/hl-gaming-role-key/${role}`, { method: 'DELETE' }),
  updateHlGamingConfig: <T, A>(config: { maxMemberRefreshesPerKey: number; roleSettings: T; automationSettings: A }) => request<{ maxMemberRefreshesPerKey: number; roleSettings: T; automationSettings: A }>('/admin/hl-gaming-config', { method: 'PATCH', body: JSON.stringify(config) }),
  removeHlGamingKey: (memberId: string) => request<void>(`/admin/hl-gaming-keys/${memberId}`, { method: 'DELETE' }),
  sendHlGamingKeyReminder: (memberId: string, notifications?: { discord: boolean; website: boolean; device: boolean }) => request<{ discordSent: boolean; websiteSent: boolean; deviceSent: boolean; discordError?: string }>(`/admin/hl-gaming-key-reminder/${memberId}`, { method: 'POST', body: JSON.stringify({ notifications: notifications || (() => { try { return JSON.parse(window.localStorage.getItem('hl-gaming-auto-reminder-notifications') || '') as { discord: boolean; website: boolean; device: boolean }; } catch { return { discord: true, website: false, device: true }; } })() }) }).then((result) => ({ ...result, discordSent: result.discordSent || result.deviceSent })),
  reconcileMember: <T>(memberId: string) => request<T>(`/admin/reconcile-member/${memberId}`, { method: 'POST' }),
  reconcileAll: () => request<{ total: number; reconciled: number; failed: number }>('/admin/reconcile-all', { method: 'POST' }),
  unsuspendMember: <T>(memberId: string) => request<T>(`/admin/members/${memberId}/unsuspend`, { method: 'POST' }),
  auditLog: <T>(query = '') => request<T>(`/admin/audit-log${query ? `?${query}` : ''}`),
  auditEvent: <T>(eventId: string) => request<T>(`/admin/audit-log/${eventId}`),
  systemHealth: <T>() => request<T>('/admin/system-health'),
  syncHealth: <T>(query = 'filter=pending&limit=10') => request<T>(`/admin/sync-health?${query}`),
  rankChannelConfig: <T>() => request<T>('/admin/rank-channel-config'),
  updateRankChannelConfig: <T>(value: Partial<T>) => request<T>('/admin/rank-channel-config', { method: 'PATCH', body: JSON.stringify(value) }),
  chatRankSummary: <T>(memberId: string) => request<T>(`/members/${memberId}/chat-rank`),
  registerForEvent: <T>(eventId: string) => request<T>(`/events/${eventId}/register`, { method: 'POST' }),
  leaveEvent: <T>(eventId: string) => request<T>(`/events/${eventId}/leave`, { method: 'POST' }),
  setEventResult: <T>(eventId: string, payload: { winnerId?: string; summary?: string }) => request<T>(`/events/${eventId}/result`, { method: 'POST', body: JSON.stringify(payload) }),
  tournaments: <T>(eventId?: string) => request<T[]>(`/tournaments${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`),
  tournament: <T>(tournamentId: string) => request<T>(`/tournaments/${tournamentId}`),
  createTournament: <T>(value: unknown) => request<T>('/tournaments', { method: 'POST', body: JSON.stringify(value) }),
  updateTournament: <T>(tournamentId: string, value: unknown) => request<T>(`/tournaments/${tournamentId}`, { method: 'PATCH', body: JSON.stringify(value) }),
  updateTournamentStatus: <T>(tournamentId: string, status: string) => request<T>(`/tournaments/${tournamentId}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  tournamentParticipants: <T>(tournamentId: string) => request<T[]>(`/tournaments/${tournamentId}/participants`),
  registerForTournament: <T>(tournamentId: string) => request<T>(`/tournaments/${tournamentId}/register`, { method: 'POST' }),
  withdrawFromTournament: <T>(tournamentId: string) => request<T>(`/tournaments/${tournamentId}/withdraw`, { method: 'POST' }),
  updateTournamentParticipant: <T>(tournamentId: string, participantId: string, status: 'registered' | 'withdrawn' | 'disqualified') => request<T>(`/tournaments/${tournamentId}/participants/${participantId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  tournamentTeams: <T>(tournamentId: string) => request<T[]>(`/tournaments/${tournamentId}/teams`),
  createTournamentTeam: <T>(tournamentId: string, value: unknown) => request<T>(`/tournaments/${tournamentId}/teams`, { method: 'POST', body: JSON.stringify(value) }),
  updateTournamentTeam: <T>(tournamentId: string, teamId: string, value: unknown) => request<T>(`/tournaments/${tournamentId}/teams/${teamId}`, { method: 'PATCH', body: JSON.stringify(value) }),
  tournamentMatches: <T>(tournamentId: string) => request<T>(`/tournaments/${tournamentId}/matches`),
  createTournamentMatch: <T>(tournamentId: string, value: unknown) => request<T>(`/tournaments/${tournamentId}/matches`, { method: 'POST', body: JSON.stringify(value) }),
  updateTournamentMatch: <T>(tournamentId: string, matchId: string, value: unknown) => request<T>(`/tournaments/${tournamentId}/matches/${matchId}`, { method: 'PATCH', body: JSON.stringify(value) }),
  tournamentBracket: <T>(tournamentId: string) => request<T>(`/tournaments/${tournamentId}/bracket`),
  generateTournamentBracket: <T>(tournamentId: string) => request<T>(`/tournaments/${tournamentId}/bracket/generate`, { method: 'POST' }),
  tournamentMatchResults: <T>(tournamentId: string, matchId: string) => request<T[]>(`/tournaments/${tournamentId}/matches/${matchId}/results`),
  submitTournamentResult: <T>(tournamentId: string, matchId: string, value: { scoreA: number; scoreB: number; winnerId: string }) => request<T>(`/tournaments/${tournamentId}/matches/${matchId}/results`, { method: 'POST', body: JSON.stringify(value) }),
  verifyTournamentResult: <T>(tournamentId: string, matchId: string, resultId: string) => request<T>(`/tournaments/${tournamentId}/matches/${matchId}/results/${resultId}/verify`, { method: 'POST' }),
  correctTournamentResult: <T>(tournamentId: string, matchId: string, resultId: string, value: { scoreA: number; scoreB: number; winnerId: string }) => request<T>(`/tournaments/${tournamentId}/matches/${matchId}/results/${resultId}`, { method: 'PATCH', body: JSON.stringify(value) }),
  tournamentStandings: <T>(tournamentId: string, page = 1, limit = 50) => request<T>(`/tournaments/${tournamentId}/standings?page=${page}&limit=${limit}`),
  rankingLeaderboard: <T>() => request<T>('/ranking/leaderboard'),
  list: <T>(resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores') => request<T[]>(`/${resource}`),
  save: <T>(resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores', value: T) => request<T>(`/${resource}`, { method: 'POST', body: JSON.stringify(value) }),
  update: <T>(resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores', id: string, value: Partial<T>) => request<T>(`/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(value) }),
  remove: (resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores', id: string) => request<void>(`/${resource}/${id}`, { method: 'DELETE' }),
};
