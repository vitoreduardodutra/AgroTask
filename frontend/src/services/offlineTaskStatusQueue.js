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

function buildLocalHistoryItem(statusValue) {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(now);

  return {
    id: `offline-status-${Date.now()}`,
    action: `Status atualizado para ${getStatusLabel(statusValue)} (pendente de sincronização)`,
    userName: 'Alteração local',
    createdAtFull: formatted,
    isOfflinePending: true,
  };
}

export function getPendingTaskStatusQueue() {
  const queue = readJsonStorage(TASK_STATUS_QUEUE_KEY);

  if (!Array.isArray(queue)) {
    return [];
  }

  return queue;
}

export function getPendingTaskStatusCount() {
  return getPendingTaskStatusQueue().length;
}

export function enqueueTaskStatusUpdate({ taskId, status }) {
  const queue = getPendingTaskStatusQueue();
  const taskIdAsString = String(taskId);

  const queueWithoutSameTask = queue.filter(
    (item) => String(item.taskId) !== taskIdAsString
  );

  const nextQueue = [
    ...queueWithoutSameTask,
    {
      taskId: taskIdAsString,
      status,
      queuedAt: new Date().toISOString(),
    },
  ];

  writeJsonStorage(TASK_STATUS_QUEUE_KEY, nextQueue);
}

export function updateTaskStatusInOfflineCaches(taskId, status) {
  const statusLabel = getStatusLabel(status);
  const statusClass = getStatusClass(status);
  const taskIdAsString = String(taskId);

  const taskDetailsCache = readJsonStorage(TASK_DETAILS_CACHE_KEY) || {};
  const taskDetailsEntry = taskDetailsCache[taskIdAsString];

  if (taskDetailsEntry?.task) {
    const currentHistories = Array.isArray(taskDetailsEntry.task.histories)
      ? taskDetailsEntry.task.histories.filter((item) => !item?.isOfflinePending)
      : [];

    taskDetailsCache[taskIdAsString] = {
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

    writeJsonStorage(TASK_DETAILS_CACHE_KEY, taskDetailsCache);
  }

  const tasksCache = readJsonStorage(TASKS_CACHE_KEY) || {};
  const updatedEntries = Object.entries(tasksCache).map(([filtersKey, entry]) => {
    if (!entry || !Array.isArray(entry.tasks)) {
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

  const taskDetailsCache = readJsonStorage(TASK_DETAILS_CACHE_KEY) || {};
  const taskDetailsEntry = taskDetailsCache[taskIdAsString];

  if (taskDetailsEntry?.task) {
    taskDetailsCache[taskIdAsString] = {
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

    writeJsonStorage(TASK_DETAILS_CACHE_KEY, taskDetailsCache);
  }

  const tasksCache = readJsonStorage(TASKS_CACHE_KEY) || {};
  const updatedEntries = Object.entries(tasksCache).map(([filtersKey, entry]) => {
    if (!entry || !Array.isArray(entry.tasks)) {
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

export async function processPendingTaskStatusQueue(apiInstance) {
  const queue = getPendingTaskStatusQueue();

  if (queue.length === 0) {
    return {
      processed: 0,
      synced: 0,
      failed: 0,
      syncedTaskIds: [],
    };
  }

  let synced = 0;
  let failed = 0;
  const remainingQueue = [];
  const syncedTaskIds = [];

  for (const item of queue) {
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
      remainingQueue.push(item);
    }
  }

  writeJsonStorage(TASK_STATUS_QUEUE_KEY, remainingQueue);

  return {
    processed: queue.length,
    synced,
    failed,
    syncedTaskIds,
  };
}