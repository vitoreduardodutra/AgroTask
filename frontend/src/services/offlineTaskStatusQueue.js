import { isRequestOfflineError } from './api';

const TASK_STATUS_QUEUE_KEY = 'agrotask_task_status_queue_v1';
const TASKS_CACHE_KEY = 'agrotask_tasks_cache_v1';
const TASK_DETAILS_CACHE_KEY = 'agrotask_task_details_cache_v1';

const STATUS_LABELS = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  LATE: 'Atrasada',
};

const STATUS_CLASSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'progress',
  COMPLETED: 'done',
  LATE: 'late',
};

let processingQueuePromise = null;

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

function buildTaskDetailsKey(taskId) {
  return `ctx:${getCurrentOfflineContextKey()}::task:${String(taskId)}`;
}

function isCurrentContextItem(item) {
  return !item?.contextKey || item.contextKey === getCurrentOfflineContextKey();
}

function readJsonStorage(key) {
  try {
    const rawValue = localStorage.getItem(key);

    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue);
  } catch (error) {
    console.error(`Erro ao ler storage local (${key}):`, error);
    return null;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Erro ao salvar storage local (${key}):`, error);
  }
}

function getStatusLabel(statusValue) {
  return STATUS_LABELS[statusValue] || statusValue;
}

function getStatusClass(statusValue) {
  return STATUS_CLASSES[statusValue] || 'pending';
}

function getCurrentUserDisplayName() {
  const user = safeParse(localStorage.getItem('agrotask_user') || '{}', {});

  return user?.name || user?.email || 'Alteração local';
}

function buildLocalHistoryItem(statusValue) {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(now);

  return {
    id: `offline-status-${Date.now()}`,
    action: `Status atualizado para ${getStatusLabel(statusValue)} (pendente de sincronização)`,
    userName: getCurrentUserDisplayName(),
    createdAtFull: formatted,
    isOfflinePending: true,
  };
}

function getAllQueueItems() {
  const queue = readJsonStorage(TASK_STATUS_QUEUE_KEY);

  if (!Array.isArray(queue)) {
    return [];
  }

  return queue;
}

export function getPendingTaskStatusQueue() {
  return getAllQueueItems().filter(isCurrentContextItem);
}

export function getPendingTaskStatusCount() {
  return getPendingTaskStatusQueue().length;
}

export function enqueueTaskStatusUpdate({ taskId, status }) {
  const allItems = getAllQueueItems();
  const currentContextKey = getCurrentOfflineContextKey();
  const taskIdAsString = String(taskId);

  const queueWithoutSameTask = allItems.filter((item) => {
    return !(
      String(item.taskId) === taskIdAsString &&
      (item.contextKey || currentContextKey) === currentContextKey
    );
  });

  const nextQueue = [
    ...queueWithoutSameTask,
    {
      id: `offline-status-${currentContextKey}-${taskIdAsString}-${Date.now()}`,
      type: 'TASK_STATUS_UPDATE',
      contextKey: currentContextKey,
      taskId: taskIdAsString,
      status,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastAttemptAt: null,
      lastError: '',
    },
  ];

  writeJsonStorage(TASK_STATUS_QUEUE_KEY, nextQueue);
}

export function updateTaskStatusInOfflineCaches(taskId, status) {
  const statusLabel = getStatusLabel(status);
  const statusClass = getStatusClass(status);
  const taskIdAsString = String(taskId);
  const currentContextKey = getCurrentOfflineContextKey();

  const taskDetailsCache = readJsonStorage(TASK_DETAILS_CACHE_KEY) || {};
  const taskDetailKeys = [buildTaskDetailsKey(taskId), taskIdAsString];

  taskDetailKeys.forEach((cacheKey) => {
    const taskDetailsEntry = taskDetailsCache[cacheKey];

    if (!taskDetailsEntry?.task) {
      return;
    }

    if (
      taskDetailsEntry.contextKey &&
      taskDetailsEntry.contextKey !== currentContextKey
    ) {
      return;
    }

    const currentHistories = Array.isArray(taskDetailsEntry.task.histories)
      ? taskDetailsEntry.task.histories.filter((item) => !item?.isOfflinePending)
      : [];

    taskDetailsCache[cacheKey] = {
      ...taskDetailsEntry,
      cachedAt: new Date().toISOString(),
      task: {
        ...taskDetailsEntry.task,
        status: statusLabel,
        statusValue: status,
        statusClass,
        hasOfflinePendingStatus: true,
        histories: [buildLocalHistoryItem(status), ...currentHistories],
      },
    };
  });

  writeJsonStorage(TASK_DETAILS_CACHE_KEY, taskDetailsCache);

  const tasksCache = readJsonStorage(TASKS_CACHE_KEY) || {};
  const updatedEntries = Object.entries(tasksCache).map(([filtersKey, entry]) => {
    if (!entry || !Array.isArray(entry.tasks)) {
      return [filtersKey, entry];
    }

    if (entry.contextKey && entry.contextKey !== currentContextKey) {
      return [filtersKey, entry];
    }

    const nextTasks = entry.tasks.map((task) => {
      if (String(task.id) !== taskIdAsString) {
        return task;
      }

      return {
        ...task,
        status: statusLabel,
        statusValue: status,
        statusClass,
        hasOfflinePendingStatus: true,
      };
    });

    return [
      filtersKey,
      {
        ...entry,
        tasks: nextTasks,
        cachedAt: new Date().toISOString(),
      },
    ];
  });

  writeJsonStorage(TASKS_CACHE_KEY, Object.fromEntries(updatedEntries));
}

function clearTaskPendingStatusInOfflineCaches(taskId) {
  const taskIdAsString = String(taskId);
  const currentContextKey = getCurrentOfflineContextKey();

  const taskDetailsCache = readJsonStorage(TASK_DETAILS_CACHE_KEY) || {};
  const taskDetailKeys = [buildTaskDetailsKey(taskId), taskIdAsString];

  taskDetailKeys.forEach((cacheKey) => {
    const taskDetailsEntry = taskDetailsCache[cacheKey];

    if (!taskDetailsEntry?.task) {
      return;
    }

    if (
      taskDetailsEntry.contextKey &&
      taskDetailsEntry.contextKey !== currentContextKey
    ) {
      return;
    }

    taskDetailsCache[cacheKey] = {
      ...taskDetailsEntry,
      cachedAt: new Date().toISOString(),
      task: {
        ...taskDetailsEntry.task,
        hasOfflinePendingStatus: false,
        histories: Array.isArray(taskDetailsEntry.task.histories)
          ? taskDetailsEntry.task.histories.filter((item) => !item?.isOfflinePending)
          : [],
      },
    };
  });

  writeJsonStorage(TASK_DETAILS_CACHE_KEY, taskDetailsCache);

  const tasksCache = readJsonStorage(TASKS_CACHE_KEY) || {};
  const updatedEntries = Object.entries(tasksCache).map(([filtersKey, entry]) => {
    if (!entry || !Array.isArray(entry.tasks)) {
      return [filtersKey, entry];
    }

    if (entry.contextKey && entry.contextKey !== currentContextKey) {
      return [filtersKey, entry];
    }

    const nextTasks = entry.tasks.map((task) => {
      if (String(task.id) !== taskIdAsString) {
        return task;
      }

      return {
        ...task,
        hasOfflinePendingStatus: false,
      };
    });

    return [
      filtersKey,
      {
        ...entry,
        tasks: nextTasks,
        cachedAt: new Date().toISOString(),
      },
    ];
  });

  writeJsonStorage(TASKS_CACHE_KEY, Object.fromEntries(updatedEntries));
}

function buildFailedQueueItem(item, error) {
  const message =
    error?.response?.data?.message ||
    error?.message ||
    'Falha ao sincronizar atualização offline.';

  return {
    ...item,
    attempts: Number(item.attempts || 0) + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: String(message),
  };
}

async function processQueueInternal(apiInstance) {
  const allItems = getAllQueueItems();
  const currentItems = allItems.filter(isCurrentContextItem);
  const otherContextItems = allItems.filter((item) => !isCurrentContextItem(item));

  if (currentItems.length === 0) {
    return {
      processed: 0,
      synced: 0,
      failed: 0,
      syncedTaskIds: [],
    };
  }

  let synced = 0;
  let failed = 0;
  const remainingCurrentItems = [];
  const syncedTaskIds = [];

  for (let index = 0; index < currentItems.length; index += 1) {
    const item = currentItems[index];

    try {
      await apiInstance.put(`/tasks/${item.taskId}`, {
        status: item.status,
      });

      synced += 1;
      syncedTaskIds.push(String(item.taskId));
      clearTaskPendingStatusInOfflineCaches(item.taskId);
    } catch (error) {
      const status = error.response?.status;

      if (status === 401) {
        throw error;
      }

      failed += 1;
      remainingCurrentItems.push(buildFailedQueueItem(item, error));

      if (isRequestOfflineError(error)) {
        const tail = currentItems.slice(index + 1);
        remainingCurrentItems.push(...tail);
        break;
      }
    }
  }

  writeJsonStorage(TASK_STATUS_QUEUE_KEY, [
    ...otherContextItems,
    ...remainingCurrentItems,
  ]);

  return {
    processed: currentItems.length,
    synced,
    failed,
    syncedTaskIds,
  };
}

export async function processPendingTaskStatusQueue(apiInstance) {
  if (processingQueuePromise) {
    return processingQueuePromise;
  }

  processingQueuePromise = processQueueInternal(apiInstance).finally(() => {
    processingQueuePromise = null;
  });

  return processingQueuePromise;
}