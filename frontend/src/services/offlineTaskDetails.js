const TASK_DETAILS_CACHE_KEY = 'agrotask_task_details_cache_v1';

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

  cacheMap[String(taskId)] = {
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

  return cacheMap[String(taskId)] || null;
}

export function clearTaskDetailsCache(taskId) {
  if (!taskId) {
    localStorage.removeItem(TASK_DETAILS_CACHE_KEY);
    return;
  }

  const cacheMap = readCacheMap();
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