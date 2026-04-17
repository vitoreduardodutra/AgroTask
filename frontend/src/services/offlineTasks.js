const TASKS_CACHE_KEY = 'agrotask_tasks_cache_v1';

function safeParse(value, fallbackValue) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallbackValue;
  }
}

function getStoredObject(key) {
  const rawValue = localStorage.getItem(key);

  if (!rawValue) {
    return {};
  }

  const parsed = safeParse(rawValue, {});

  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  return parsed;
}

function getCurrentOfflineContextKey() {
  const user = safeParse(localStorage.getItem('agrotask_user') || '{}', {});
  const farm = safeParse(localStorage.getItem('agrotask_farm') || '{}', {});
  const membership = safeParse(
    localStorage.getItem('agrotask_membership') || '{}',
    {}
  );

  const farmId = farm?.id ?? 'no-farm';
  const membershipId = membership?.id ?? membership?.role ?? 'no-membership';
  const userId = user?.id ?? 'no-user';

  return `farm:${farmId}|membership:${membershipId}|user:${userId}`;
}

function normalizeFilters(filters = {}) {
  return {
    search: String(filters.search || '').trim(),
    status: String(filters.status || '').trim(),
    priority: String(filters.priority || '').trim(),
  };
}

function buildFiltersKey(filters = {}) {
  const normalized = normalizeFilters(filters);
  const contextKey = getCurrentOfflineContextKey();

  return `ctx:${contextKey}::filters:${JSON.stringify(normalized)}`;
}

function readCacheMap() {
  try {
    return getStoredObject(TASKS_CACHE_KEY);
  } catch (error) {
    console.error('Erro ao ler cache offline de tarefas:', error);
    return {};
  }
}

function writeCacheMap(cacheMap) {
  try {
    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(cacheMap));
  } catch (error) {
    console.error('Erro ao salvar cache offline de tarefas:', error);
  }
}

export function saveTasksCache({ filters, tasks, total }) {
  const cacheMap = readCacheMap();
  const filtersKey = buildFiltersKey(filters);
  const contextKey = getCurrentOfflineContextKey();

  cacheMap[filtersKey] = {
    contextKey,
    filters: normalizeFilters(filters),
    tasks: Array.isArray(tasks) ? tasks : [],
    total: Number(total || 0),
    cachedAt: new Date().toISOString(),
  };

  writeCacheMap(cacheMap);
}

export function getTasksCache(filters) {
  const cacheMap = readCacheMap();
  const filtersKey = buildFiltersKey(filters);

  if (cacheMap[filtersKey]) {
    return cacheMap[filtersKey];
  }

  const legacyKey = JSON.stringify(normalizeFilters(filters));

  return cacheMap[legacyKey] || null;
}

export function clearTasksCache() {
  localStorage.removeItem(TASKS_CACHE_KEY);
}

export function formatCacheDateTime(cachedAt) {
  if (!cachedAt) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(cachedAt));
  } catch (error) {
    return '';
  }
}