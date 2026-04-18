const prisma = require('../config/prisma');

const SYNC_NOTIFICATION_TYPES = [
  'TASK_LATE',
  'TASK_DUE_TODAY',
  'TASK_DUE_TOMORROW',
];

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function formatDate(date) {
  if (!date) {
    return '--/--/----';
  }

  return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
}

function getTaskNotificationDefinition(task) {
  if (!task?.deadline || task.status === 'COMPLETED') {
    return null;
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = startOfDay(tomorrow);
  const tomorrowEnd = endOfDay(tomorrow);

  const deadline = new Date(task.deadline);

  if (task.status === 'LATE' || deadline < todayStart) {
    return {
      type: 'TASK_LATE',
      title: 'Tarefa atrasada',
      message: `${task.title} está atrasada desde ${formatDate(task.deadline)}.`,
    };
  }

  if (deadline >= todayStart && deadline <= todayEnd) {
    return {
      type: 'TASK_DUE_TODAY',
      title: 'Prazo vence hoje',
      message: `${task.title} vence hoje.`,
    };
  }

  if (deadline >= tomorrowStart && deadline <= tomorrowEnd) {
    return {
      type: 'TASK_DUE_TOMORROW',
      title: 'Prazo vence amanhã',
      message: `${task.title} vence amanhã.`,
    };
  }

  return null;
}

async function syncNotificationsForUser({ userId, farmId, role }) {
  const taskWhere = {
    farmId,
  };

  if (role !== 'ADMIN') {
    taskWhere.responsibleId = userId;
  }

  const tasks = await prisma.task.findMany({
    where: taskWhere,
    select: {
      id: true,
      title: true,
      deadline: true,
      status: true,
    },
  });

  const desiredNotifications = tasks
    .map((task) => {
      const definition = getTaskNotificationDefinition(task);

      if (!definition) {
        return null;
      }

      return {
        userId,
        farmId,
        taskId: task.id,
        type: definition.type,
        title: definition.title,
        message: definition.message,
      };
    })
    .filter(Boolean);

  const existingNotifications = await prisma.notification.findMany({
    where: {
      userId,
      farmId,
      type: {
        in: SYNC_NOTIFICATION_TYPES,
      },
    },
    select: {
      id: true,
      taskId: true,
      type: true,
      title: true,
      message: true,
    },
  });

  const desiredKeys = new Set(
    desiredNotifications.map((notification) => `${notification.taskId}-${notification.type}`)
  );

  const existingByKey = new Map(
    existingNotifications.map((notification) => [
      `${notification.taskId}-${notification.type}`,
      notification,
    ])
  );

  const operations = [];

  for (const notification of desiredNotifications) {
    const key = `${notification.taskId}-${notification.type}`;
    const existing = existingByKey.get(key);

    if (!existing) {
      operations.push(
        prisma.notification.create({
          data: notification,
        })
      );
      continue;
    }

    if (
      existing.title !== notification.title ||
      existing.message !== notification.message
    ) {
      operations.push(
        prisma.notification.update({
          where: {
            id: existing.id,
          },
          data: {
            title: notification.title,
            message: notification.message,
          },
        })
      );
    }
  }

  for (const existing of existingNotifications) {
    const key = `${existing.taskId}-${existing.type}`;

    if (!desiredKeys.has(key)) {
      operations.push(
        prisma.notification.delete({
          where: {
            id: existing.id,
          },
        })
      );
    }
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
}

async function upsertNotification({
  userId,
  farmId,
  taskId,
  type,
  title,
  message,
}) {
  const existingNotification = await prisma.notification.findFirst({
    where: {
      userId,
      farmId,
      taskId,
      type,
    },
    select: {
      id: true,
    },
  });

  if (!existingNotification) {
    return prisma.notification.create({
      data: {
        userId,
        farmId,
        taskId,
        type,
        title,
        message,
        isRead: false,
      },
    });
  }

  return prisma.notification.update({
    where: {
      id: existingNotification.id,
    },
    data: {
      title,
      message,
      isRead: false,
      readAt: null,
    },
  });
}

async function createAssignedNotification({
  userId,
  farmId,
  taskId,
  taskTitle,
}) {
  const title = 'Nova tarefa atribuída';
  const message = `Você recebeu a tarefa "${taskTitle}".`;

  return upsertNotification({
    userId,
    farmId,
    taskId,
    type: 'TASK_ASSIGNED',
    title,
    message,
  });
}

async function createCompletionReviewPendingNotifications({
  farmId,
  taskId,
  taskTitle,
  responsibleName,
}) {
  const admins = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      memberships: {
        some: {
          farmId,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      },
    },
    select: {
      id: true,
    },
  });

  const title = 'Conclusão aguardando aprovação';
  const message = `A tarefa "${taskTitle}" foi concluída por ${responsibleName} e aguarda aprovação.`;

  await Promise.all(
    admins.map((admin) =>
      upsertNotification({
        userId: admin.id,
        farmId,
        taskId,
        type: 'TASK_COMPLETION_REVIEW_PENDING',
        title,
        message,
      })
    )
  );
}

async function clearTaskCompletionPendingNotifications({ farmId, taskId }) {
  await prisma.notification.deleteMany({
    where: {
      farmId,
      taskId,
      type: 'TASK_COMPLETION_REVIEW_PENDING',
    },
  });
}

async function createCompletionApprovedNotification({
  userId,
  farmId,
  taskId,
  taskTitle,
}) {
  const title = 'Conclusão aprovada';
  const message = `A conclusão da tarefa "${taskTitle}" foi aprovada pelo administrador.`;

  return upsertNotification({
    userId,
    farmId,
    taskId,
    type: 'TASK_COMPLETION_APPROVED',
    title,
    message,
  });
}

async function createCompletionRejectedNotification({
  userId,
  farmId,
  taskId,
  taskTitle,
  reason,
}) {
  const title = 'Conclusão devolvida para ajuste';
  const message = reason
    ? `A conclusão da tarefa "${taskTitle}" foi devolvida. Motivo: ${reason}`
    : `A conclusão da tarefa "${taskTitle}" foi devolvida para ajuste.`;

  return upsertNotification({
    userId,
    farmId,
    taskId,
    type: 'TASK_COMPLETION_REJECTED',
    title,
    message,
  });
}

async function getUnreadCount({ userId, farmId }) {
  return prisma.notification.count({
    where: {
      userId,
      farmId,
      isRead: false,
    },
  });
}

module.exports = {
  syncNotificationsForUser,
  createAssignedNotification,
  createCompletionReviewPendingNotifications,
  clearTaskCompletionPendingNotifications,
  createCompletionApprovedNotification,
  createCompletionRejectedNotification,
  getUnreadCount,
};