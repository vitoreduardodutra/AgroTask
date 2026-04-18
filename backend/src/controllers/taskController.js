const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');

const APP_TIME_ZONE = 'America/Sao_Paulo';
const {
  createAssignedNotification,
  createCompletionReviewPendingNotifications,
  clearTaskCompletionPendingNotifications,
  createCompletionApprovedNotification,
  createCompletionRejectedNotification,
} = require('../services/notificationService');

function formatDate(date) {
  if (!date) {
    return '--/--/----';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIME_ZONE,
  }).format(new Date(date));
}

function formatDateLong(date) {
  if (!date) {
    return '--';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

function formatDateTime(date) {
  if (!date) {
    return '--';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

function mapPriority(priority) {
  const priorities = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
  };

  return priorities[priority] || priority;
}

function mapStatus(status) {
  const statuses = {
    PENDING: 'Pendente',
    IN_PROGRESS: 'Em andamento',
    COMPLETED: 'Concluída',
    LATE: 'Atrasada',
  };

  return statuses[status] || status;
}

function mapCompletionReviewStatus(status) {
  const labels = {
    NOT_REQUIRED: 'Não aplicável',
    PENDING: 'Aguardando aprovação',
    APPROVED: 'Aprovada',
    REJECTED: 'Devolvida para ajuste',
  };

  return labels[status] || status;
}

function getPriorityClass(priority) {
  const classes = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
  };

  return classes[priority] || 'medium';
}

function getStatusClass(status) {
  const classes = {
    PENDING: 'pending',
    IN_PROGRESS: 'progress',
    COMPLETED: 'done',
    LATE: 'late',
  };

  return classes[status] || 'pending';
}

function getInitials(name) {
  return (name || 'SR')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function getAreaLabel(task) {
  return task.area || task.description || 'Sem área informada';
}

function normalizeEvidenceFileName(fileName) {
  const normalizedValue = String(fileName || '').trim();

  if (!normalizedValue) {
    return 'arquivo';
  }

  try {
    if (/[ÃÂ]/.test(normalizedValue)) {
      return Buffer.from(normalizedValue, 'latin1')
        .toString('utf8')
        .normalize('NFC');
    }
  } catch (error) {
    return normalizedValue.normalize('NFC');
  }

  return normalizedValue.normalize('NFC');
}

function parseBooleanValue(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value ?? '').trim().toLowerCase();

  if (['true', '1', 'yes', 'sim', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'não', 'nao', 'off', ''].includes(normalized)) {
    return false;
  }

  return Boolean(value);
}

function getAuthenticatedUserId(req) {
  const possibleIds = [
    req.user?.id,
    req.user?.userId,
    req.user?.sub,
    req.user?.user?.id,
  ];

  const validId = possibleIds.find((value) => Number.isInteger(Number(value)));

  return validId ? Number(validId) : null;
}

function getAuthenticatedFarmId(req) {
  const possibleIds = [
    req.user?.farmId,
    req.user?.farm?.id,
    req.user?.membership?.farmId,
  ];

  const validId = possibleIds.find((value) => Number.isInteger(Number(value)));

  return validId ? Number(validId) : null;
}

function isAdmin(req) {
  return req.user?.role === 'ADMIN';
}

function getEvidenceRequirements(task) {
  return [
    task.requirePhotoEvidence ? 'foto' : null,
    task.requireNoteEvidence ? 'observação' : null,
    task.requireLocationEvidence ? 'localização' : null,
  ].filter(Boolean);
}

function getMissingEvidenceRequirements(task) {
  const evidences = Array.isArray(task?.evidences) ? task.evidences : [];
  const missing = [];

  if (
    task.requirePhotoEvidence &&
    !evidences.some((evidence) =>
      String(evidence.fileType || '').toLowerCase().startsWith('image/')
    )
  ) {
    missing.push('foto');
  }

  if (
    task.requireNoteEvidence &&
    !evidences.some((evidence) => String(evidence.note || '').trim())
  ) {
    missing.push('observação');
  }

  if (
    task.requireLocationEvidence &&
    !evidences.some(
      (evidence) =>
        evidence.latitude !== null &&
        evidence.latitude !== undefined &&
        evidence.longitude !== null &&
        evidence.longitude !== undefined
    )
  ) {
    missing.push('localização');
  }

  return missing;
}

function buildMissingEvidenceRequirementsMessage(missingRequirements) {
  if (!missingRequirements.length) {
    return '';
  }

  if (missingRequirements.length === 1) {
    return `Esta tarefa exige pelo menos uma evidência com ${missingRequirements[0]} antes da conclusão.`;
  }

  const lastRequirement = missingRequirements[missingRequirements.length - 1];
  const firstPart = missingRequirements.slice(0, -1).join(', ');

  return `Esta tarefa exige evidências com ${firstPart} e ${lastRequirement} antes da conclusão.`;
}

function buildTaskReviewData({
  existingTask = null,
  nextStatus,
  completionRequiresApproval,
  actorIsAdmin,
  reviewerId,
}) {
  if (!completionRequiresApproval) {
    return {
      completionReviewStatus: 'NOT_REQUIRED',
      completionReviewedAt: null,
      completionReviewedById: null,
      completionRejectionReason: null,
    };
  }

  if (nextStatus !== 'COMPLETED') {
    if (existingTask?.completionReviewStatus === 'REJECTED') {
      return {
        completionReviewStatus: 'REJECTED',
        completionReviewedAt: existingTask.completionReviewedAt || null,
        completionReviewedById: existingTask.completionReviewedById || null,
        completionRejectionReason: existingTask.completionRejectionReason || null,
      };
    }

    return {
      completionReviewStatus: 'NOT_REQUIRED',
      completionReviewedAt: null,
      completionReviewedById: null,
      completionRejectionReason: null,
    };
  }

  if (actorIsAdmin) {
    return {
      completionReviewStatus: 'APPROVED',
      completionReviewedAt: new Date(),
      completionReviewedById: reviewerId || null,
      completionRejectionReason: null,
    };
  }

  return {
    completionReviewStatus: 'PENDING',
    completionReviewedAt: null,
    completionReviewedById: null,
    completionRejectionReason: null,
  };
}

function buildTaskResponse(task) {
  return {
    id: task.id,
    code: `AGRO-${String(task.id).padStart(6, '0')}`,
    title: task.title,
    description: task.description,
    area: task.area || 'Sem área informada',
    priority: mapPriority(task.priority),
    priorityValue: task.priority,
    priorityClass: getPriorityClass(task.priority),
    status: mapStatus(task.status),
    statusValue: task.status,
    statusClass: getStatusClass(task.status),
    deadline: formatDate(task.deadline),
    deadlineLong: formatDateLong(task.deadline),
    deadlineIso: task.deadline ? new Date(task.deadline).toISOString() : null,
    deadlineRaw: task.deadline || null,
    createdAt: formatDate(task.createdAt),
    createdAtFull: formatDateTime(task.createdAt),
    updatedAt: formatDateTime(task.updatedAt),

    completionRequiresApproval: Boolean(task.completionRequiresApproval),
    completionReviewStatus: task.completionReviewStatus,
    completionReviewStatusLabel: mapCompletionReviewStatus(task.completionReviewStatus),
    completionReviewedAt: task.completionReviewedAt
      ? task.completionReviewedAt.toISOString()
      : null,
    completionReviewedAtFull: formatDateTime(task.completionReviewedAt),
    completionReviewedById: task.completionReviewedBy?.id || null,
    completionReviewedByName: task.completionReviewedBy?.name || '',
    completionRejectionReason: task.completionRejectionReason || '',
    canReviewCompletion:
      Boolean(task.completionRequiresApproval) &&
      task.completionReviewStatus === 'PENDING' &&
      task.status === 'COMPLETED',

    requirePhotoEvidence: Boolean(task.requirePhotoEvidence),
    requireNoteEvidence: Boolean(task.requireNoteEvidence),
    requireLocationEvidence: Boolean(task.requireLocationEvidence),
    evidenceRequirements: getEvidenceRequirements(task),
    missingEvidenceRequirements: getMissingEvidenceRequirements(task),

    responsible: {
      id: task.responsible?.id || null,
      name: task.responsible?.name || 'Sem responsável',
      initials: getInitials(task.responsible?.name),
      status: task.responsible?.status || null,
    },
    evidences: (task.evidences || []).map((evidence) => ({
      id: evidence.id,
      fileName: normalizeEvidenceFileName(evidence.fileName),
      filePath: evidence.filePath,
      fileType: evidence.fileType,
      note: evidence.note,
      latitude: evidence.latitude,
      longitude: evidence.longitude,
      createdAt: formatDateTime(evidence.createdAt),
      authorName: task.responsible?.name || 'Usuário',
    })),
    histories: (task.histories || []).map((history) => ({
      id: history.id,
      action: history.action,
      userName: history.user?.name || 'Usuário',
      createdAt: formatDate(history.createdAt),
      createdAtFull: formatDateTime(history.createdAt),
    })),
  };
}

const TASK_DETAILS_INCLUDE = {
  responsible: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  completionReviewedBy: {
    select: {
      id: true,
      name: true,
    },
  },
  evidences: {
    orderBy: {
      createdAt: 'desc',
    },
  },
  histories: {
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
};

async function findResponsibleInSameFarm(responsibleId, farmId) {
  return prisma.user.findFirst({
    where: {
      id: responsibleId,
      status: 'ACTIVE',
      memberships: {
        some: {
          farmId,
          status: 'ACTIVE',
        },
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });
}

async function findTaskInUserFarm(taskId, farmId) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      farmId,
    },
    include: {
      responsible: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      completionReviewedBy: {
        select: {
          id: true,
          name: true,
        },
      },
      evidences: true,
    },
  });
}

async function getFullTaskById(taskId, farmId) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      farmId,
    },
    include: TASK_DETAILS_INCLUDE,
  });
}

async function listTasks(req, res) {
  try {
    const { search = '', status = '', priority = '' } = req.query;
    const farmId = getAuthenticatedFarmId(req);
    const userId = getAuthenticatedUserId(req);

    if (!farmId) {
      return res.status(403).json({
        message: 'Usuário sem fazenda vinculada.',
      });
    }

    const trimmedSearch = search.trim();
    const trimmedStatus = status.trim().toUpperCase();
    const trimmedPriority = priority.trim().toUpperCase();

    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'LATE'];
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH'];

    const where = {
      farmId,
    };

    if (!isAdmin(req) && userId) {
      where.responsibleId = userId;
    }

    if (trimmedSearch) {
      where.OR = [
        {
          title: {
            contains: trimmedSearch,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: trimmedSearch,
            mode: 'insensitive',
          },
        },
        {
          area: {
            contains: trimmedSearch,
            mode: 'insensitive',
          },
        },
        {
          responsible: {
            is: {
              name: {
                contains: trimmedSearch,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    if (trimmedStatus && validStatuses.includes(trimmedStatus)) {
      where.status = trimmedStatus;
    }

    if (trimmedPriority && validPriorities.includes(trimmedPriority)) {
      where.priority = trimmedPriority;
    }

    const tasksRaw = await prisma.task.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        responsible: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const tasks = tasksRaw.map((task) => ({
      id: task.id,
      title: task.title,
      area: getAreaLabel(task),
      responsible: task.responsible?.name || 'Sem responsável',
      initials: getInitials(task.responsible?.name),
      priority: mapPriority(task.priority),
      priorityClass: getPriorityClass(task.priority),
      status: mapStatus(task.status),
      statusValue: task.status,
      statusClass: getStatusClass(task.status),
      deadline: formatDate(task.deadline),
      deadlineHighlight: task.status === 'LATE',
      completionRequiresApproval: Boolean(task.completionRequiresApproval),
      completionReviewStatus: task.completionReviewStatus,
      completionReviewStatusLabel: mapCompletionReviewStatus(task.completionReviewStatus),
      hasPendingCompletionReview:
        task.completionRequiresApproval &&
        task.completionReviewStatus === 'PENDING' &&
        task.status === 'COMPLETED',
    }));

    return res.status(200).json({
      message: 'Tarefas carregadas com sucesso.',
      total: tasks.length,
      tasks,
    });
  } catch (error) {
    console.error('Erro ao listar tarefas:', error);

    return res.status(500).json({
      message: 'Erro interno ao carregar tarefas.',
    });
  }
}

async function getTaskFormOptions(req, res) {
  try {
    const farmId = getAuthenticatedFarmId(req);

    if (!farmId) {
      return res.status(403).json({
        message: 'Usuário sem fazenda vinculada.',
      });
    }

    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        memberships: {
          some: {
            farmId,
            status: 'ACTIVE',
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
        status: true,
        memberships: {
          where: {
            farmId,
            status: 'ACTIVE',
          },
          select: {
            role: true,
          },
          take: 1,
        },
      },
    });

    return res.status(200).json({
      message: 'Opções do formulário carregadas com sucesso.',
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        status: user.status,
        role: user.memberships[0]?.role || null,
      })),
      priorities: [
        { value: 'LOW', label: 'Baixa' },
        { value: 'MEDIUM', label: 'Média' },
        { value: 'HIGH', label: 'Alta' },
      ],
      statuses: [
        { value: 'PENDING', label: 'Pendente' },
        { value: 'IN_PROGRESS', label: 'Em andamento' },
        { value: 'COMPLETED', label: 'Concluída' },
        { value: 'LATE', label: 'Atrasada' },
      ],
    });
  } catch (error) {
    console.error('Erro ao carregar opções da tarefa:', error);

    return res.status(500).json({
      message: 'Erro interno ao carregar opções da tarefa.',
    });
  }
}

async function createTask(req, res) {
  try {
    const farmId = getAuthenticatedFarmId(req);
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!farmId) {
      return res.status(403).json({
        message: 'Usuário sem fazenda vinculada.',
      });
    }

    const {
      title,
      description,
      area,
      responsibleId,
      deadline,
      priority,
      status,
      completionRequiresApproval,
      requirePhotoEvidence,
      requireNoteEvidence,
      requireLocationEvidence,
    } = req.body;

    const normalizedTitle = String(title || '').trim();
    const normalizedDescription = String(description || '').trim();
    const normalizedArea = String(area || '').trim();
    const normalizedPriority = String(priority || '').trim().toUpperCase();
    const normalizedStatus = String(status || '').trim().toUpperCase();
    const normalizedResponsibleId = Number(responsibleId);
    const normalizedDeadline = deadline ? new Date(deadline) : null;

    const normalizedCompletionRequiresApproval = parseBooleanValue(
      completionRequiresApproval
    );
    const normalizedRequirePhotoEvidence = parseBooleanValue(requirePhotoEvidence);
    const normalizedRequireNoteEvidence = parseBooleanValue(requireNoteEvidence);
    const normalizedRequireLocationEvidence = parseBooleanValue(
      requireLocationEvidence
    );

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH'];
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'LATE'];

    if (!normalizedTitle) {
      return res.status(400).json({
        message: 'O título da tarefa é obrigatório.',
      });
    }

    if (!normalizedDescription) {
      return res.status(400).json({
        message: 'A descrição da tarefa é obrigatória.',
      });
    }

    if (!Number.isInteger(normalizedResponsibleId) || normalizedResponsibleId <= 0) {
      return res.status(400).json({
        message: 'Selecione um responsável válido.',
      });
    }

    if (!normalizedDeadline || Number.isNaN(normalizedDeadline.getTime())) {
      return res.status(400).json({
        message: 'Informe um prazo válido.',
      });
    }

    if (!validPriorities.includes(normalizedPriority)) {
      return res.status(400).json({
        message: 'Informe uma prioridade válida.',
      });
    }

    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        message: 'Informe um status válido.',
      });
    }

    if (
      normalizedStatus === 'COMPLETED' &&
      (normalizedRequirePhotoEvidence ||
        normalizedRequireNoteEvidence ||
        normalizedRequireLocationEvidence)
    ) {
      return res.status(400).json({
        message:
          'Não é possível criar a tarefa já concluída quando ela exige evidências obrigatórias. Cadastre a tarefa e envie as evidências antes de concluí-la.',
      });
    }

    const responsibleUser = await findResponsibleInSameFarm(
      normalizedResponsibleId,
      farmId
    );

    if (!responsibleUser) {
      return res.status(400).json({
        message:
          'O responsável informado não foi encontrado, está inativo ou não pertence à fazenda.',
      });
    }

    const reviewData = buildTaskReviewData({
      nextStatus: normalizedStatus,
      completionRequiresApproval: normalizedCompletionRequiresApproval,
      actorIsAdmin: true,
      reviewerId: authenticatedUserId,
    });

    const task = await prisma.task.create({
      data: {
        title: normalizedTitle,
        description: normalizedDescription,
        area: normalizedArea || null,
        responsibleId: normalizedResponsibleId,
        farmId,
        deadline: normalizedDeadline,
        priority: normalizedPriority,
        status: normalizedStatus,

        completionRequiresApproval: normalizedCompletionRequiresApproval,
        completionReviewStatus: reviewData.completionReviewStatus,
        completionReviewedAt: reviewData.completionReviewedAt,
        completionReviewedById: reviewData.completionReviewedById,
        completionRejectionReason: reviewData.completionRejectionReason,

        requirePhotoEvidence: normalizedRequirePhotoEvidence,
        requireNoteEvidence: normalizedRequireNoteEvidence,
        requireLocationEvidence: normalizedRequireLocationEvidence,
      },
      include: {
        responsible: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (authenticatedUserId) {
      const historyActions = [`Tarefa criada: ${task.title}`];

      if (normalizedCompletionRequiresApproval) {
        historyActions.push('A tarefa foi configurada para exigir aprovação de conclusão');
      }

      if (normalizedRequirePhotoEvidence) {
        historyActions.push('A tarefa foi configurada para exigir evidência com foto');
      }

      if (normalizedRequireNoteEvidence) {
        historyActions.push('A tarefa foi configurada para exigir evidência com observação');
      }

      if (normalizedRequireLocationEvidence) {
        historyActions.push('A tarefa foi configurada para exigir evidência com localização');
      }

      await prisma.history.createMany({
        data: historyActions.map((action) => ({
          action,
          taskId: task.id,
          userId: authenticatedUserId,
        })),
      });
    }

    await createAssignedNotification({
      userId: normalizedResponsibleId,
      farmId,
      taskId: task.id,
      taskTitle: task.title,
    });

    return res.status(201).json({
      message: 'Tarefa criada com sucesso.',
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        area: task.area,
        responsibleId: task.responsibleId,
        responsibleName: task.responsible?.name || 'Sem responsável',
        farmId: task.farmId,
        deadline: task.deadline,
        priority: task.priority,
        status: task.status,
        completionRequiresApproval: task.completionRequiresApproval,
        completionReviewStatus: task.completionReviewStatus,
        requirePhotoEvidence: task.requirePhotoEvidence,
        requireNoteEvidence: task.requireNoteEvidence,
        requireLocationEvidence: task.requireLocationEvidence,
        createdAt: task.createdAt,
      },
    });
  } catch (error) {
    console.error('Erro ao criar tarefa:', error);

    return res.status(500).json({
      message: 'Erro interno ao criar tarefa.',
    });
  }
}

async function getTaskById(req, res) {
  try {
    const taskId = Number(req.params.id);
    const farmId = getAuthenticatedFarmId(req);
    const userId = getAuthenticatedUserId(req);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({
        message: 'ID da tarefa inválido.',
      });
    }

    if (!farmId) {
      return res.status(403).json({
        message: 'Usuário sem fazenda vinculada.',
      });
    }

    const where = {
      id: taskId,
      farmId,
    };

    if (!isAdmin(req) && userId) {
      where.responsibleId = userId;
    }

    const task = await prisma.task.findFirst({
      where,
      include: TASK_DETAILS_INCLUDE,
    });

    if (!task) {
      return res.status(404).json({
        message: 'Tarefa não encontrada.',
      });
    }

    return res.status(200).json({
      message: 'Detalhes da tarefa carregados com sucesso.',
      task: buildTaskResponse(task),
    });
  } catch (error) {
    console.error('Erro ao carregar detalhes da tarefa:', error);

    return res.status(500).json({
      message: 'Erro interno ao carregar detalhes da tarefa.',
    });
  }
}

async function updateTask(req, res) {
  try {
    const taskId = Number(req.params.id);
    const farmId = getAuthenticatedFarmId(req);
    const userId = getAuthenticatedUserId(req);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({
        message: 'ID da tarefa inválido.',
      });
    }

    if (!farmId) {
      return res.status(403).json({
        message: 'Usuário sem fazenda vinculada.',
      });
    }

    const existingTask = await findTaskInUserFarm(taskId, farmId);

    if (!existingTask) {
      return res.status(404).json({
        message: 'Tarefa não encontrada.',
      });
    }

    if (!isAdmin(req) && existingTask.responsibleId !== userId) {
      return res.status(403).json({
        message: 'Você não tem permissão para editar esta tarefa.',
      });
    }

    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!isAdmin(req)) {
      const normalizedStatus = String(req.body.status || '').trim().toUpperCase();
      const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'LATE'];

      if (!validStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          message: 'Informe um status válido.',
        });
      }

      if (normalizedStatus === 'COMPLETED') {
        const missingRequirements = getMissingEvidenceRequirements(existingTask);

        if (missingRequirements.length > 0) {
          return res.status(400).json({
            message: buildMissingEvidenceRequirementsMessage(missingRequirements),
          });
        }
      }

      const reviewData = buildTaskReviewData({
        existingTask,
        nextStatus: normalizedStatus,
        completionRequiresApproval: existingTask.completionRequiresApproval,
        actorIsAdmin: false,
        reviewerId: null,
      });

      await prisma.task.update({
        where: {
          id: taskId,
        },
        data: {
          status: normalizedStatus,
          completionReviewStatus: reviewData.completionReviewStatus,
          completionReviewedAt: reviewData.completionReviewedAt,
          completionReviewedById: reviewData.completionReviewedById,
          completionRejectionReason: reviewData.completionRejectionReason,
        },
      });

      if (reviewData.completionReviewStatus === 'PENDING') {
        await createCompletionReviewPendingNotifications({
          farmId,
          taskId,
          taskTitle: existingTask.title,
          responsibleName: req.user?.name || existingTask.responsible?.name || 'Usuário',
        });
      } else {
        await clearTaskCompletionPendingNotifications({ farmId, taskId });
      }

      if (authenticatedUserId) {
        const action =
          reviewData.completionReviewStatus === 'PENDING'
            ? 'Tarefa concluída e enviada para aprovação do administrador'
            : existingTask.status !== normalizedStatus
            ? `Status alterado de ${mapStatus(existingTask.status)} para ${mapStatus(normalizedStatus)}`
            : 'Status da tarefa salvo sem alteração detectada';

        await prisma.history.create({
          data: {
            action,
            taskId,
            userId: authenticatedUserId,
          },
        });
      }

      const refreshedTask = await getFullTaskById(taskId, farmId);

      return res.status(200).json({
        message:
          reviewData.completionReviewStatus === 'PENDING'
            ? 'Tarefa concluída e enviada para aprovação do administrador.'
            : 'Status da tarefa atualizado com sucesso.',
        task: buildTaskResponse(refreshedTask),
      });
    }

    const {
      title,
      description,
      area,
      responsibleId,
      deadline,
      priority,
      status,
      completionRequiresApproval,
      requirePhotoEvidence,
      requireNoteEvidence,
      requireLocationEvidence,
    } = req.body;

    const normalizedTitle = String(title || '').trim();
    const normalizedDescription = String(description || '').trim();
    const normalizedArea = String(area || '').trim();
    const normalizedPriority = String(priority || '').trim().toUpperCase();
    const normalizedStatus = String(status || '').trim().toUpperCase();
    const normalizedResponsibleId = Number(responsibleId);
    const normalizedDeadline = deadline ? new Date(deadline) : null;

    const normalizedCompletionRequiresApproval = parseBooleanValue(
      completionRequiresApproval
    );
    const normalizedRequirePhotoEvidence = parseBooleanValue(requirePhotoEvidence);
    const normalizedRequireNoteEvidence = parseBooleanValue(requireNoteEvidence);
    const normalizedRequireLocationEvidence = parseBooleanValue(
      requireLocationEvidence
    );

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH'];
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'LATE'];

    if (!normalizedTitle) {
      return res.status(400).json({
        message: 'O título da tarefa é obrigatório.',
      });
    }

    if (!normalizedDescription) {
      return res.status(400).json({
        message: 'A descrição da tarefa é obrigatória.',
      });
    }

    if (!Number.isInteger(normalizedResponsibleId) || normalizedResponsibleId <= 0) {
      return res.status(400).json({
        message: 'Selecione um responsável válido.',
      });
    }

    if (!normalizedDeadline || Number.isNaN(normalizedDeadline.getTime())) {
      return res.status(400).json({
        message: 'Informe um prazo válido.',
      });
    }

    if (!validPriorities.includes(normalizedPriority)) {
      return res.status(400).json({
        message: 'Informe uma prioridade válida.',
      });
    }

    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        message: 'Informe um status válido.',
      });
    }

    const responsibleUser = await findResponsibleInSameFarm(
      normalizedResponsibleId,
      farmId
    );

    if (!responsibleUser) {
      return res.status(400).json({
        message:
          'O responsável informado não foi encontrado, está inativo ou não pertence à fazenda.',
      });
    }

    const draftTaskForValidation = {
      ...existingTask,
      requirePhotoEvidence: normalizedRequirePhotoEvidence,
      requireNoteEvidence: normalizedRequireNoteEvidence,
      requireLocationEvidence: normalizedRequireLocationEvidence,
    };

    if (normalizedStatus === 'COMPLETED') {
      const missingRequirements = getMissingEvidenceRequirements(
        draftTaskForValidation
      );

      if (missingRequirements.length > 0) {
        return res.status(400).json({
          message: buildMissingEvidenceRequirementsMessage(missingRequirements),
        });
      }
    }

    const reviewData = buildTaskReviewData({
      existingTask,
      nextStatus: normalizedStatus,
      completionRequiresApproval: normalizedCompletionRequiresApproval,
      actorIsAdmin: true,
      reviewerId: authenticatedUserId,
    });

    await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        title: normalizedTitle,
        description: normalizedDescription,
        area: normalizedArea || null,
        responsibleId: normalizedResponsibleId,
        deadline: normalizedDeadline,
        priority: normalizedPriority,
        status: normalizedStatus,

        completionRequiresApproval: normalizedCompletionRequiresApproval,
        completionReviewStatus: reviewData.completionReviewStatus,
        completionReviewedAt: reviewData.completionReviewedAt,
        completionReviewedById: reviewData.completionReviewedById,
        completionRejectionReason: reviewData.completionRejectionReason,

        requirePhotoEvidence: normalizedRequirePhotoEvidence,
        requireNoteEvidence: normalizedRequireNoteEvidence,
        requireLocationEvidence: normalizedRequireLocationEvidence,
      },
    });

    if (reviewData.completionReviewStatus !== 'PENDING') {
      await clearTaskCompletionPendingNotifications({ farmId, taskId });
    }

    const historyChanges = [];

    if (existingTask.title !== normalizedTitle) {
      historyChanges.push(
        `Título alterado de "${existingTask.title}" para "${normalizedTitle}"`
      );
    }

    if (existingTask.description !== normalizedDescription) {
      historyChanges.push('Descrição da tarefa atualizada');
    }

    if ((existingTask.area || '') !== normalizedArea) {
      historyChanges.push(
        `Área alterada de "${existingTask.area || 'Sem área'}" para "${normalizedArea || 'Sem área'}"`
      );
    }

    if (existingTask.priority !== normalizedPriority) {
      historyChanges.push(
        `Prioridade alterada de ${mapPriority(existingTask.priority)} para ${mapPriority(normalizedPriority)}`
      );
    }

    if (existingTask.status !== normalizedStatus) {
      historyChanges.push(
        `Status alterado de ${mapStatus(existingTask.status)} para ${mapStatus(normalizedStatus)}`
      );
    }

    if (new Date(existingTask.deadline).getTime() !== normalizedDeadline.getTime()) {
      historyChanges.push(
        `Prazo alterado de ${formatDate(existingTask.deadline)} para ${formatDate(normalizedDeadline)}`
      );
    }

    if (existingTask.responsibleId !== normalizedResponsibleId) {
      historyChanges.push(
        `Responsável alterado de ${existingTask.responsible?.name || 'Sem responsável'} para ${responsibleUser.name}`
      );
    }

    if (
      Boolean(existingTask.completionRequiresApproval) !==
      normalizedCompletionRequiresApproval
    ) {
      historyChanges.push(
        normalizedCompletionRequiresApproval
          ? 'A tarefa passou a exigir aprovação do administrador na conclusão'
          : 'A tarefa deixou de exigir aprovação do administrador na conclusão'
      );
    }

    if (Boolean(existingTask.requirePhotoEvidence) !== normalizedRequirePhotoEvidence) {
      historyChanges.push(
        normalizedRequirePhotoEvidence
          ? 'A tarefa passou a exigir evidência com foto'
          : 'A tarefa deixou de exigir evidência com foto'
      );
    }

    if (Boolean(existingTask.requireNoteEvidence) !== normalizedRequireNoteEvidence) {
      historyChanges.push(
        normalizedRequireNoteEvidence
          ? 'A tarefa passou a exigir evidência com observação'
          : 'A tarefa deixou de exigir evidência com observação'
      );
    }

    if (
      Boolean(existingTask.requireLocationEvidence) !==
      normalizedRequireLocationEvidence
    ) {
      historyChanges.push(
        normalizedRequireLocationEvidence
          ? 'A tarefa passou a exigir evidência com localização'
          : 'A tarefa deixou de exigir evidência com localização'
      );
    }

    if (
      normalizedStatus === 'COMPLETED' &&
      normalizedCompletionRequiresApproval &&
      reviewData.completionReviewStatus === 'APPROVED'
    ) {
      historyChanges.push('Conclusão registrada como aprovada pelo administrador');
    }

    if (historyChanges.length === 0) {
      historyChanges.push('Tarefa editada sem alterações detectadas');
    }

    if (authenticatedUserId) {
      await prisma.history.createMany({
        data: historyChanges.map((action) => ({
          action,
          taskId,
          userId: authenticatedUserId,
        })),
      });
    }

    if (existingTask.responsibleId !== normalizedResponsibleId) {
      await createAssignedNotification({
        userId: normalizedResponsibleId,
        farmId,
        taskId,
        taskTitle: normalizedTitle,
      });
    }

    const refreshedTask = await getFullTaskById(taskId, farmId);

    return res.status(200).json({
      message: 'Tarefa atualizada com sucesso.',
      task: buildTaskResponse(refreshedTask),
    });
  } catch (error) {
    console.error('Erro ao atualizar tarefa:', error);

    return res.status(500).json({
      message: 'Erro interno ao atualizar tarefa.',
    });
  }
}

async function reviewTaskCompletion(req, res) {
  try {
    const taskId = Number(req.params.id);
    const farmId = getAuthenticatedFarmId(req);
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({
        message: 'ID da tarefa inválido.',
      });
    }

    if (!farmId) {
      return res.status(403).json({
        message: 'Usuário sem fazenda vinculada.',
      });
    }

    const { decision, reason } = req.body;

    const normalizedDecision = String(decision || '').trim().toUpperCase();
    const normalizedReason = String(reason || '').trim();

    if (!['APPROVE', 'REJECT'].includes(normalizedDecision)) {
      return res.status(400).json({
        message: 'Decisão de revisão inválida.',
      });
    }

    const task = await findTaskInUserFarm(taskId, farmId);

    if (!task) {
      return res.status(404).json({
        message: 'Tarefa não encontrada.',
      });
    }

    if (!task.completionRequiresApproval) {
      return res.status(400).json({
        message: 'Esta tarefa não exige aprovação de conclusão.',
      });
    }

    if (task.completionReviewStatus !== 'PENDING' || task.status !== 'COMPLETED') {
      return res.status(400).json({
        message: 'Não existe uma conclusão pendente de aprovação para esta tarefa.',
      });
    }

    if (normalizedDecision === 'REJECT' && !normalizedReason) {
      return res.status(400).json({
        message: 'Informe o motivo da devolução para ajuste.',
      });
    }

    const nextStatus = normalizedDecision === 'APPROVE' ? 'COMPLETED' : 'IN_PROGRESS';
    const nextReviewStatus =
      normalizedDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        status: nextStatus,
        completionReviewStatus: nextReviewStatus,
        completionReviewedAt: new Date(),
        completionReviewedById: authenticatedUserId || null,
        completionRejectionReason:
          normalizedDecision === 'REJECT' ? normalizedReason : null,
      },
    });

    if (authenticatedUserId) {
      await prisma.history.create({
        data: {
          action:
            normalizedDecision === 'APPROVE'
              ? 'Conclusão da tarefa aprovada pelo administrador'
              : `Conclusão da tarefa devolvida para ajuste. Motivo: ${normalizedReason}`,
          taskId,
          userId: authenticatedUserId,
        },
      });
    }

    await clearTaskCompletionPendingNotifications({ farmId, taskId });

    if (normalizedDecision === 'APPROVE') {
      await createCompletionApprovedNotification({
        userId: task.responsibleId,
        farmId,
        taskId,
        taskTitle: task.title,
      });
    } else {
      await createCompletionRejectedNotification({
        userId: task.responsibleId,
        farmId,
        taskId,
        taskTitle: task.title,
        reason: normalizedReason,
      });
    }

    const refreshedTask = await getFullTaskById(taskId, farmId);

    return res.status(200).json({
      message:
        normalizedDecision === 'APPROVE'
          ? 'Conclusão aprovada com sucesso.'
          : 'Conclusão devolvida para ajuste com sucesso.',
      task: buildTaskResponse(refreshedTask),
    });
  } catch (error) {
    console.error('Erro ao revisar conclusão da tarefa:', error);

    return res.status(500).json({
      message: 'Erro interno ao revisar a conclusão da tarefa.',
    });
  }
}

async function deleteTask(req, res) {
  try {
    const taskId = Number(req.params.id);
    const farmId = getAuthenticatedFarmId(req);
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({
        message: 'ID da tarefa inválido.',
      });
    }

    if (!farmId) {
      return res.status(403).json({
        message: 'Usuário sem fazenda vinculada.',
      });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({
        message: 'Apenas administradores podem excluir tarefas.',
      });
    }

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        farmId,
      },
      include: {
        evidences: true,
      },
    });

    if (!task) {
      return res.status(404).json({
        message: 'Tarefa não encontrada.',
      });
    }

    const evidenceFiles = task.evidences
      .map((evidence) => evidence.filePath)
      .filter(Boolean);

    await prisma.$transaction(async (tx) => {
      if (authenticatedUserId) {
        await tx.history.create({
          data: {
            action: `Tarefa excluída: ${task.title}`,
            taskId: task.id,
            userId: authenticatedUserId,
          },
        });
      }

      await tx.evidence.deleteMany({
        where: {
          taskId: task.id,
        },
      });

      await tx.history.deleteMany({
        where: {
          taskId: task.id,
        },
      });

      await tx.notification.deleteMany({
        where: {
          taskId: task.id,
        },
      });

      await tx.task.delete({
        where: {
          id: task.id,
        },
      });
    });

    for (const relativeFilePath of evidenceFiles) {
      const absoluteFilePath = path.resolve(__dirname, '../..', relativeFilePath);

      if (fs.existsSync(absoluteFilePath)) {
        fs.unlinkSync(absoluteFilePath);
      }
    }

    return res.status(200).json({
      message: 'Tarefa excluída com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao excluir tarefa:', error);

    return res.status(500).json({
      message: 'Erro interno ao excluir tarefa.',
    });
  }
}

async function uploadTaskEvidence(req, res) {
  try {
    const taskId = Number(req.params.id);
    const farmId = getAuthenticatedFarmId(req);
    const userId = getAuthenticatedUserId(req);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({
        message: 'ID da tarefa inválido.',
      });
    }

    if (!farmId) {
      return res.status(403).json({
        message: 'Usuário sem fazenda vinculada.',
      });
    }

    const where = {
      id: taskId,
      farmId,
    };

    if (!isAdmin(req) && userId) {
      where.responsibleId = userId;
    }

    const task = await prisma.task.findFirst({
      where,
      include: {
        responsible: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!task) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(404).json({
        message: 'Tarefa não encontrada.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: 'Selecione um arquivo para enviar.',
      });
    }

    const note = String(req.body.note || '').trim();
    const latitude =
      req.body.latitude !== undefined && req.body.latitude !== ''
        ? Number(req.body.latitude)
        : null;
    const longitude =
      req.body.longitude !== undefined && req.body.longitude !== ''
        ? Number(req.body.longitude)
        : null;

    if (latitude !== null && Number.isNaN(latitude)) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(400).json({
        message: 'Latitude inválida.',
      });
    }

    if (longitude !== null && Number.isNaN(longitude)) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(400).json({
        message: 'Longitude inválida.',
      });
    }

    const relativeFilePath = path
      .relative(path.resolve(__dirname, '../..'), req.file.path)
      .replace(/\\/g, '/');

    const evidence = await prisma.evidence.create({
      data: {
        fileName: normalizeEvidenceFileName(req.file.originalname),
        filePath: relativeFilePath,
        fileType: req.file.mimetype,
        note: note || null,
        latitude,
        longitude,
        taskId,
      },
    });

    const authenticatedUserId = getAuthenticatedUserId(req);

    if (authenticatedUserId) {
      const normalizedOriginalName = normalizeEvidenceFileName(req.file.originalname);
      const historyParts = [`Evidência enviada: ${normalizedOriginalName}`];

      if (note) {
        historyParts.push('com observação');
      }

      if (latitude !== null && longitude !== null) {
        historyParts.push('com localização');
      }

      await prisma.history.create({
        data: {
          action: historyParts.join(' '),
          taskId,
          userId: authenticatedUserId,
        },
      });
    }

    return res.status(201).json({
      message: 'Evidência enviada com sucesso.',
      evidence: {
        id: evidence.id,
        fileName: normalizeEvidenceFileName(evidence.fileName),
        filePath: evidence.filePath,
        fileType: evidence.fileType,
        note: evidence.note,
        latitude: evidence.latitude,
        longitude: evidence.longitude,
        createdAt: formatDateTime(evidence.createdAt),
        authorName: req.user?.name || task.responsible?.name || 'Usuário',
      },
    });
  } catch (error) {
    console.error('Erro ao enviar evidência:', error);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      message: 'Erro interno ao enviar evidência.',
    });
  }
}

async function deleteTaskEvidence(req, res) {
  try {
    const taskId = Number(req.params.id);
    const evidenceId = Number(req.params.evidenceId);
    const farmId = getAuthenticatedFarmId(req);
    const userId = getAuthenticatedUserId(req);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({
        message: 'ID da tarefa inválido.',
      });
    }

    if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
      return res.status(400).json({
        message: 'ID da evidência inválido.',
      });
    }

    if (!farmId) {
      return res.status(403).json({
        message: 'Usuário sem fazenda vinculada.',
      });
    }

    const taskWhere = {
      id: taskId,
      farmId,
    };

    if (!isAdmin(req) && userId) {
      taskWhere.responsibleId = userId;
    }

    const task = await prisma.task.findFirst({
      where: taskWhere,
      select: {
        id: true,
      },
    });

    if (!task) {
      return res.status(404).json({
        message: 'Tarefa não encontrada.',
      });
    }

    const evidence = await prisma.evidence.findFirst({
      where: {
        id: evidenceId,
        taskId,
        task: {
          farmId,
        },
      },
    });

    if (!evidence) {
      return res.status(404).json({
        message: 'Evidência não encontrada.',
      });
    }

    await prisma.evidence.delete({
      where: {
        id: evidenceId,
      },
    });

    const absoluteFilePath = path.resolve(__dirname, '../..', evidence.filePath);

    if (fs.existsSync(absoluteFilePath)) {
      fs.unlinkSync(absoluteFilePath);
    }

    const authenticatedUserId = getAuthenticatedUserId(req);

    if (authenticatedUserId) {
      await prisma.history.create({
        data: {
          action: `Evidência removida: ${normalizeEvidenceFileName(evidence.fileName)}`,
          taskId,
          userId: authenticatedUserId,
        },
      });
    }

    return res.status(200).json({
      message: 'Evidência removida com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao remover evidência:', error);

    return res.status(500).json({
      message: 'Erro interno ao remover evidência.',
    });
  }
}

module.exports = {
  listTasks,
  getTaskFormOptions,
  createTask,
  getTaskById,
  updateTask,
  reviewTaskCompletion,
  deleteTask,
  uploadTaskEvidence,
  deleteTaskEvidence,
};