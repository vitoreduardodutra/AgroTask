const TASK_DETAILS_CACHE_KEY = 'agrotask_task_details_cache_v1';

function safeParse(value, fallbackValue) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallbackValue;
  }
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

function buildTaskKey(taskId) {
  return `ctx:${getCurrentOfflineContextKey()}::task:${String(taskId)}`;
}

function readCacheMap() {
  try {
    const rawValue = localStorage.getItem(TASK_DETAILS_CACHE_KEY);

    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);

    if (!parsedValue || typeof parsedValue !== 'object') {
      return {};
    }

    return parsedValue;
  } catch (error) {
    console.error('Erro ao ler cache offline do detalhe da tarefa:', error);
    return {};
  }
}

function writeCacheMap(cacheMap) {
  try {
    localStorage.setItem(TASK_DETAILS_CACHE_KEY, JSON.stringify(cacheMap));
  } catch (error) {
    console.error('Erro ao salvar cache offline do detalhe da tarefa:', error);
  }
}

export function saveTaskDetailsCache(taskId, task) {
  if (!taskId || !task) {
    return;
  }

  const cacheMap = readCacheMap();
  const taskKey = buildTaskKey(taskId);

  cacheMap[taskKey] = {
    contextKey: getCurrentOfflineContextKey(),
    task,
    cachedAt: new Date().toISOString(),
  };

  writeCacheMap(cacheMap);
}

export function getTaskDetailsCache(taskId) {
  if (!taskId) {
    return null;
  }

  const cacheMap = readCacheMap();
  const taskKey = buildTaskKey(taskId);

  if (cacheMap[taskKey]) {
    return cacheMap[taskKey];
  }

  return cacheMap[String(taskId)] || null;
}

export function clearTaskDetailsCache(taskId) {
  if (!taskId) {
    localStorage.removeItem(TASK_DETAILS_CACHE_KEY);
    return;
  }

  const cacheMap = readCacheMap();
  delete cacheMap[buildTaskKey(taskId)];
  delete cacheMap[String(taskId)];
  writeCacheMap(cacheMap);
}

export function formatTaskDetailsCacheDateTime(cachedAt) {
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