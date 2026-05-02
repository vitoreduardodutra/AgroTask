const prisma = require('../config/prisma');

const APP_TIME_ZONE = 'America/Sao_Paulo';
const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'LATE'];
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

function mapTaskStatus(status) {
  const labels = {
    PENDING: 'Pendente',
    IN_PROGRESS: 'Em andamento',
    COMPLETED: 'Concluida',
    LATE: 'Atrasada',
  };

  return labels[status] || status || '-';
}

function mapTaskPriority(priority) {
  const labels = {
    LOW: 'Baixa',
    MEDIUM: 'Media',
    HIGH: 'Alta',
  };

  return labels[priority] || priority || '-';
}

function formatDate(date) {
  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

function formatDateTime(date) {
  if (!date) {
    return '-';
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

function formatCoordinate(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }

  return Number(value).toFixed(6);
}

function getStartOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getEndOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function parseOptionalPositiveInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

function normalizeDateRange(startDate, endDate) {
  const normalizedStart = startDate ? new Date(startDate) : null;
  const normalizedEnd = endDate ? new Date(endDate) : null;

  if (normalizedStart && Number.isNaN(normalizedStart.getTime())) {
    throw new Error('Data inicial invalida.');
  }

  if (normalizedEnd && Number.isNaN(normalizedEnd.getTime())) {
    throw new Error('Data final invalida.');
  }

  if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
    throw new Error('A data inicial nao pode ser maior que a data final.');
  }

  return {
    start: normalizedStart ? getStartOfDay(normalizedStart) : null,
    end: normalizedEnd ? getEndOfDay(normalizedEnd) : null,
  };
}

function buildDateFilter(field, startDate, endDate) {
  const filter = {};

  if (startDate) {
    filter.gte = startDate;
  }

  if (endDate) {
    filter.lte = endDate;
  }

  if (!Object.keys(filter).length) {
    return null;
  }

  return {
    [field]: filter,
  };
}

function normalizeTaskFilters(rawFilters = {}) {
  const { start, end } = normalizeDateRange(rawFilters.startDate, rawFilters.endDate);
  const normalizedStatus = String(rawFilters.status || '').trim().toUpperCase();
  const normalizedPriority = String(rawFilters.priority || '').trim().toUpperCase();
  const responsibleId = parseOptionalPositiveInteger(rawFilters.responsibleId);

  if (normalizedStatus && !TASK_STATUSES.includes(normalizedStatus)) {
    throw new Error('Status da tarefa invalido.');
  }

  if (normalizedPriority && !TASK_PRIORITIES.includes(normalizedPriority)) {
    throw new Error('Prioridade da tarefa invalida.');
  }

  if (
    rawFilters.responsibleId !== undefined &&
    rawFilters.responsibleId !== null &&
    rawFilters.responsibleId !== '' &&
    !responsibleId
  ) {
    throw new Error('Responsavel invalido.');
  }

  return {
    startDate: start,
    endDate: end,
    status: normalizedStatus || '',
    priority: normalizedPriority || '',
    responsibleId,
  };
}

function normalizeEvidenceFilters(rawFilters = {}) {
  const { start, end } = normalizeDateRange(rawFilters.startDate, rawFilters.endDate);
  const normalizedStatus = String(rawFilters.status || '').trim().toUpperCase();
  const responsibleId = parseOptionalPositiveInteger(rawFilters.responsibleId);
  const taskId = parseOptionalPositiveInteger(rawFilters.taskId);

  if (normalizedStatus && !TASK_STATUSES.includes(normalizedStatus)) {
    throw new Error('Status da tarefa invalido.');
  }

  if (
    rawFilters.responsibleId !== undefined &&
    rawFilters.responsibleId !== null &&
    rawFilters.responsibleId !== '' &&
    !responsibleId
  ) {
    throw new Error('Responsavel invalido.');
  }

  if (
    rawFilters.taskId !== undefined &&
    rawFilters.taskId !== null &&
    rawFilters.taskId !== '' &&
    !taskId
  ) {
    throw new Error('Tarefa invalida.');
  }

  return {
    startDate: start,
    endDate: end,
    status: normalizedStatus || '',
    responsibleId,
    taskId,
  };
}

async function ensureResponsibleBelongsToFarm(responsibleId, farmId) {
  if (!responsibleId) {
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: responsibleId,
      memberships: {
        some: {
          farmId,
          status: 'ACTIVE',
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    throw new Error('Responsavel fora do escopo da fazenda atual.');
  }
}

async function ensureTaskBelongsToFarm(taskId, farmId) {
  if (!taskId) {
    return;
  }

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      farmId,
    },
    select: {
      id: true,
    },
  });

  if (!task) {
    throw new Error('Tarefa fora do escopo da fazenda atual.');
  }
}

async function getFarmSummary(farmId) {
  return prisma.farm.findUnique({
    where: {
      id: farmId,
    },
    select: {
      id: true,
      name: true,
      segment: true,
    },
  });
}

function buildTaskWhereClause(farmId, filters) {
  const where = {
    farmId,
  };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.priority) {
    where.priority = filters.priority;
  }

  if (filters.responsibleId) {
    where.responsibleId = filters.responsibleId;
  }

  const createdAtFilter = buildDateFilter('createdAt', filters.startDate, filters.endDate);

  if (createdAtFilter) {
    Object.assign(where, createdAtFilter);
  }

  return where;
}

function buildEvidenceWhereClause(farmId, filters) {
  const taskWhere = {
    farmId,
  };
  const where = {};

  if (filters.taskId) {
    where.taskId = filters.taskId;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};

    if (filters.startDate) {
      where.createdAt.gte = filters.startDate;
    }

    if (filters.endDate) {
      where.createdAt.lte = filters.endDate;
    }
  }

  if (filters.responsibleId) {
    taskWhere.responsibleId = filters.responsibleId;
  }

  if (filters.status) {
    taskWhere.status = filters.status;
  }

  where.task = {
    is: taskWhere,
  };

  return where;
}

async function getTaskReportData({ farmId, filters }) {
  const normalizedFilters = normalizeTaskFilters(filters);

  await ensureResponsibleBelongsToFarm(normalizedFilters.responsibleId, farmId);

  const [farm, tasks] = await Promise.all([
    getFarmSummary(farmId),
    prisma.task.findMany({
      where: buildTaskWhereClause(farmId, normalizedFilters),
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
        _count: {
          select: {
            evidences: true,
          },
        },
      },
    }),
  ]);

  const rows = tasks.map((task) => ({
    titulo: task.title || '-',
    descricao: task.description || '-',
    status: mapTaskStatus(task.status),
    prioridade: mapTaskPriority(task.priority),
    responsavel: task.responsible?.name || '-',
    area: task.area || '-',
    prazo: formatDate(task.deadline),
    criadoEm: formatDateTime(task.createdAt),
    atualizadoEm: formatDateTime(task.updatedAt),
    evidencias: String(task._count?.evidences || 0),
    fazenda: farm?.name || '-',
  }));

  return {
    reportTitle: 'Relatorio de tarefas',
    fileName: 'relatorio-tarefas',
    farm,
    filters: normalizedFilters,
    generatedAt: new Date(),
    rows,
  };
}

async function getEvidenceReportData({ farmId, filters }) {
  const normalizedFilters = normalizeEvidenceFilters(filters);

  await Promise.all([
    ensureResponsibleBelongsToFarm(normalizedFilters.responsibleId, farmId),
    ensureTaskBelongsToFarm(normalizedFilters.taskId, farmId),
  ]);

  const [farm, evidences] = await Promise.all([
    getFarmSummary(farmId),
    prisma.evidence.findMany({
      where: buildEvidenceWhereClause(farmId, normalizedFilters),
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            farmId: true,
            responsible: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const rows = evidences.map((evidence) => ({
    tarefa: evidence.task?.title || '-',
    responsavel: evidence.task?.responsible?.name || '-',
    observacao: evidence.note || '-',
    latitude: formatCoordinate(evidence.latitude),
    longitude: formatCoordinate(evidence.longitude),
    enviadoEm: formatDateTime(evidence.createdAt),
    arquivo: evidence.fileName || '-',
    caminho: evidence.filePath || '-',
    statusTarefa: mapTaskStatus(evidence.task?.status),
    fazenda: farm?.name || '-',
  }));

  return {
    reportTitle: 'Relatorio de evidencias',
    fileName: 'relatorio-evidencias',
    farm,
    filters: normalizedFilters,
    generatedAt: new Date(),
    rows,
  };
}

function escapeCsvValue(value) {
  const normalizedValue = String(value ?? '');
  const escapedValue = normalizedValue.replace(/"/g, '""');
  return `"${escapedValue}"`;
}

function buildCsvBuffer(rows) {
  if (!rows.length) {
    return Buffer.from('\uFEFFSem resultados\r\n', 'utf8');
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsvValue).join(';'),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(';')
    ),
  ];

  return Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8');
}

function normalizePdfText(value) {
  return String(value ?? '-')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function describeFilters(filters) {
  const descriptions = [];

  if (filters.startDate) {
    descriptions.push(`Data inicial: ${formatDate(filters.startDate)}`);
  }

  if (filters.endDate) {
    descriptions.push(`Data final: ${formatDate(filters.endDate)}`);
  }

  if (filters.status) {
    descriptions.push(`Status: ${mapTaskStatus(filters.status)}`);
  }

  if (filters.priority) {
    descriptions.push(`Prioridade: ${mapTaskPriority(filters.priority)}`);
  }

  if (filters.responsibleId) {
    descriptions.push(`Responsavel ID: ${filters.responsibleId}`);
  }

  if (filters.taskId) {
    descriptions.push(`Tarefa ID: ${filters.taskId}`);
  }

  return descriptions.length ? descriptions : ['Sem filtros adicionais'];
}

function buildPdfLines({
  reportTitle,
  generatedAt,
  farm,
  requestedBy,
  filters,
  rows,
}) {
  const lines = [
    reportTitle,
    '',
    `Gerado em: ${formatDateTime(generatedAt)}`,
    `Fazenda: ${farm?.name || '-'}${farm?.segment ? ` (${farm.segment})` : ''}`,
    `Gerado por: ${requestedBy?.name || '-'} (${requestedBy?.email || '-'})`,
    '',
    'Filtros aplicados',
    ...describeFilters(filters).map((filterDescription) => `- ${filterDescription}`),
    '',
    `Total de registros: ${rows.length}`,
    '',
  ];

  if (!rows.length) {
    lines.push('Nenhum dado encontrado para os filtros informados.');
    return lines;
  }

  rows.forEach((row, index) => {
    lines.push(`${index + 1}. Registro`);

    Object.entries(row).forEach(([label, value]) => {
      lines.push(`${label}: ${String(value ?? '-')}`);
    });

    lines.push('');
  });

  return lines;
}

function buildPdfContentStream(lines, pageIndex, linesPerPage) {
  const pageLines = lines.slice(pageIndex * linesPerPage, (pageIndex + 1) * linesPerPage);
  const startY = 800;
  const lineHeight = 14;
  const operations = ['BT', '/F1 11 Tf'];

  pageLines.forEach((line, lineIndex) => {
    const y = startY - lineIndex * lineHeight;
    operations.push(`1 0 0 1 40 ${y} Tm (${normalizePdfText(line)}) Tj`);
  });

  operations.push('ET');

  return operations.join('\n');
}

function buildPdfBuffer({
  reportTitle,
  generatedAt,
  farm,
  requestedBy,
  filters,
  rows,
}) {
  const lines = buildPdfLines({
    reportTitle,
    generatedAt,
    farm,
    requestedBy,
    filters,
    rows,
  });
  const linesPerPage = 48;
  const pageCount = Math.max(1, Math.ceil(lines.length / linesPerPage));
  const objects = [];
  const pageObjectIds = [];
  const contentObjectIds = [];
  let nextObjectId = 3;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    pageObjectIds.push(nextObjectId);
    nextObjectId += 1;
    contentObjectIds.push(nextObjectId);
    nextObjectId += 1;
  }

  const fontObjectId = nextObjectId;

  objects.push({
    id: 1,
    body: '<< /Type /Catalog /Pages 2 0 R >>',
  });

  objects.push({
    id: 2,
    body: `<< /Type /Pages /Kids [${pageObjectIds
      .map((pageId) => `${pageId} 0 R`)
      .join(' ')}] /Count ${pageCount} >>`,
  });

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageId = pageObjectIds[pageIndex];
    const contentId = contentObjectIds[pageIndex];
    const stream = buildPdfContentStream(lines, pageIndex, linesPerPage);

    objects.push({
      id: pageId,
      body:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >> ` +
        `/Contents ${contentId} 0 R >>`,
    });

    objects.push({
      id: contentId,
      body:
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n` +
        `${stream}\nendstream`,
    });
  }

  objects.push({
    id: fontObjectId,
    body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object) => {
    offsets[object.id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${object.id} 0 obj\n${object.body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');

  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  objects.forEach((object) => {
    pdf += `${String(offsets[object.id]).padStart(10, '0')} 00000 n \n`;
  });

  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

module.exports = {
  getTaskReportData,
  getEvidenceReportData,
  buildCsvBuffer,
  buildPdfBuffer,
};
