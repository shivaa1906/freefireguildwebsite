export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const API_BASE = `${BACKEND_URL}/api`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
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
  health: requestHealth,
  guildProfile: <T>() => request<T>('/guild-profile'),
  refreshGuildProfile: <T>() => request<T>('/guild-profile/refresh', { method: 'POST' }),
  saveHlGamingApiKey: (memberId: string, apiKey: string) => request<{ saved: boolean; hasHlGamingApiKey: boolean }>(`/members/${memberId}/hl-gaming-key`, { method: 'POST', body: JSON.stringify({ apiKey }) }),
  adminHlGamingKeys: <T>() => request<T>('/admin/hl-gaming-keys'),
  saveHlGamingRoleKey: (role: string, apiKey: string) => request<{ role: string; key: { configured: boolean; key: string | null; source: string } }>('/admin/hl-gaming-role-key', { method: 'POST', body: JSON.stringify({ role, apiKey }) }),
  removeHlGamingRoleKey: (role: string) => request<void>(`/admin/hl-gaming-role-key/${role}`, { method: 'DELETE' }),
  updateHlGamingConfig: <T, A>(config: { maxMemberRefreshesPerKey: number; roleSettings: T; automationSettings: A }) => request<{ maxMemberRefreshesPerKey: number; roleSettings: T; automationSettings: A }>('/admin/hl-gaming-config', { method: 'PATCH', body: JSON.stringify(config) }),
  removeHlGamingKey: (memberId: string) => request<void>(`/admin/hl-gaming-keys/${memberId}`, { method: 'DELETE' }),
  sendHlGamingKeyReminder: (memberId: string, notifications?: { discord: boolean; website: boolean; device: boolean }) => request<{ discordSent: boolean; websiteSent: boolean; deviceSent: boolean; discordError?: string }>(`/admin/hl-gaming-key-reminder/${memberId}`, { method: 'POST', body: JSON.stringify({ notifications: notifications || (() => { try { return JSON.parse(window.localStorage.getItem('hl-gaming-auto-reminder-notifications') || '') as { discord: boolean; website: boolean; device: boolean }; } catch { return { discord: true, website: false, device: true }; } })() }) }).then((result) => ({ ...result, discordSent: result.discordSent || result.deviceSent })),
  list: <T>(resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores') => request<T[]>(`/${resource}`),
  save: <T>(resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores', value: T) => request<T>(`/${resource}`, { method: 'POST', body: JSON.stringify(value) }),
  update: <T>(resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores', id: string, value: Partial<T>) => request<T>(`/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(value) }),
  remove: (resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores', id: string) => request<void>(`/${resource}/${id}`, { method: 'DELETE' }),
};
