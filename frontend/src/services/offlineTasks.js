const TASKS_CACHE_KEY = 'agrotask_tasks_cache_v1';

function normalizeFilters(filters = {}) {
  return {
    search: String(filters.search || '').trim(),
    status: String(filters.status || '').trim(),
    priority: String(filters.priority || '').trim(),
  };
}

function buildFiltersKey(filters = {}) {
  const normalized = normalizeFilters(filters);

  return JSON.stringify(normalized);
}

function readCacheMap() {
  try {
    const rawValue = localStorage.getItem(TASKS_CACHE_KEY);

    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);

    if (!parsedValue || typeof parsedValue !== 'object') {
      return {};
    }

    return parsedValue;
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

  cacheMap[filtersKey] = {
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

  return cacheMap[filtersKey] || null;
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