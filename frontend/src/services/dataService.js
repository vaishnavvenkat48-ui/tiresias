import api, { unwrap, API_BASE } from './api';

/**
 * Read a Server-Sent-Events response from a POST (EventSource can't send a
 * body or Authorization header, so we stream with fetch).
 */
const postStream = async (path, body, { onEvent, signal, auth = true } = {}) => {
  const token = localStorage.getItem('tiresias_token');
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'text/event-stream', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) window.dispatchEvent(new CustomEvent('tiresias:unauthorized'));
    const err = new Error(j.message || `Request failed (${res.status})`);
    err.response = { status: res.status, data: j };
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (event) onEvent?.(event, data ? JSON.parse(data) : null);
    }
  }
};

/* Knowledge graphs — /api/graphs */
export const graphsApi = {
  list: async ({ limit = 50, page = 1, saved, q, category } = {}) => unwrap(await api.get('/graphs', { params: { owner: 'me', limit, page, saved: saved === undefined ? undefined : saved ? 1 : 0, q, category } })),
  get: async (id) => unwrap(await api.get(`/graphs/${id}`)),
  /**
   * Sources-first generation over SSE: `stage` (real progress) → `graph` (render now)
   * → `enrich` (AI additions) → `done`. Rejects on `error`.
   */
  generateStream: (topic, { fresh = false, signal, onEvent } = {}) => postStream('/graphs/generate/stream', { topic, fresh }, {
    signal,
    onEvent: (event, data) => {
      if (event === 'error') { const e = new Error(data?.message || 'Generation failed'); e.response = { status: data?.status, data }; throw e; }
      onEvent?.(event, data);
    },
  }),
  saveLayout: async (id, layout) => unwrap(await api.patch(`/graphs/${id}/layout`, { layout })),
  save: async (id, saved = true) => unwrap(await api.post(`/graphs/${id}/save`, { saved })),
  share: async (id, enabled = true) => unwrap(await api.post(`/graphs/${id}/share`, { enabled })),
  remove: async (id) => unwrap(await api.delete(`/graphs/${id}`)),
  /** Server-side expansion → { nodes, edges } that were added. */
  expand: async (id, nodeId) => unwrap(await api.post(`/graphs/${id}/expand/${encodeURIComponent(nodeId)}`, null, { timeout: 90000 })),
};

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/* Personal analytics + history — /api/analytics, /api/activity */
export const analyticsApi = {
  me: async (days = 30) => unwrap(await api.get('/analytics/me', { params: { days, tz: tz() } })),
  activity: async ({ page = 1, limit = 30, type } = {}) => unwrap(await api.get('/activity/history', { params: { page, limit, type } })),
};

export const activityApi = {
  /** Fire-and-forget client interaction (NODE_SELECTED, RESOURCE_OPENED, …). */
  record: (action, payload = {}) => api.post('/activity', { action, ...payload }).catch(() => null),
};

/* Learning resources — /api/resources (all cached server-side) */
export const resourcesApi = {
  topic: async (topic, { context, wikidataId } = {}) => unwrap(await api.get('/resources/topic', { params: { topic, context, wikidataId } })),
  images: async (topic, context) => unwrap(await api.get('/resources/images', { params: { topic, context } })),
  videos: async (topic, context, graphId) => unwrap(await api.get('/resources/videos', { params: { topic, context, graphId } })),
  research: async (topic, context, graphId) => unwrap(await api.get('/resources/research', { params: { topic, context, graphId } })),
};

/* AI — /api/ai */
export const aiApi = {
  chat: async ({ message, conversationId, graphId, focus }) => unwrap(await api.post('/ai/chat', { message, conversationId, graphId, focus }, { timeout: 60000 })),
  conversations: async () => unwrap(await api.get('/ai/conversations')),
  conversation: async (id) => unwrap(await api.get(`/ai/conversations/${id}`)),
  deleteConversation: async (id) => unwrap(await api.delete(`/ai/conversations/${id}`)),
  explain: async (topic, { context, wikidataId } = {}) => unwrap(await api.post('/ai/explain', { topic, context, wikidataId }, { timeout: 60000 })),
  recommendations: async () => unwrap(await api.post('/ai/recommendations', null, { timeout: 60000 })),
};

/* Public (no account) — /api/public */
export const publicApi = {
  showcase: async (topic) => unwrap(await api.get('/public/showcase', { params: { topic } })),
  tryTopic: async (topic) => unwrap(await api.post('/public/try', { topic }, { timeout: 60000 })),
  topic: async (topic, { context, wikidataId } = {}) => unwrap(await api.get('/public/topic', { params: { topic, context, wikidataId } })),
  shared: async (shareId) => unwrap(await api.get(`/public/graphs/${shareId}`)),
};

/* Account — /api/users */
export const usersApi = {
  preferences: async (prefs) => (await api.patch('/users/preferences', prefs)).data,
  changePassword: async (currentPassword, newPassword) => (await api.patch('/users/password', { currentPassword, newPassword })).data,
  deleteAccount: async (password) => (await api.delete('/users/account', { data: { password } })).data,
};
