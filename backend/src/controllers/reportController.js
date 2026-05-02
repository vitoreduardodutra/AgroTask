const {
  getTaskReportData,
  getEvidenceReportData,
  buildCsvBuffer,
  buildPdfBuffer,
} = require('../services/reportService');

function getAuthenticatedFarmId(req) {
  const possibleIds = [
    req.user?.farmId,
    req.user?.farm?.id,
    req.user?.membership?.farmId,
  ];

  const validId = possibleIds.find((value) => Number.isInteger(Number(value)));

  return validId ? Number(validId) : null;
}

function getRequestedFormat(req) {
  return String(req.query.format || '').trim().toLowerCase();
}

function ensureSupportedFormat(format) {
  if (!['csv', 'pdf'].includes(format)) {
    throw new Error('Formato invalido. Use csv ou pdf.');
  }
}

function getRequestedByUser(req) {
  return {
    id: req.user?.id || null,
    name: req.user?.name || '-',
    email: req.user?.email || '-',
  };
}

function getErrorStatus(error) {
  return /invalido|escopo|formato|data inicial|data final|nao pode ser maior/i.test(
    String(error?.message || '')
  )
    ? 400
    : 500;
}

function sendCsvResponse(res, fileName, rows) {
  const csvBuffer = buildCsvBuffer(rows);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Report-Row-Count', String(rows.length));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileName}.csv"`
  );

  return res.status(200).send(csvBuffer);
}

async function exportTaskReport(req, res) {
  try {
    const farmId = getAuthenticatedFarmId(req);

    if (!farmId) {
      console.warn('[REPORT] Tentativa de acesso sem farmId:', {
        userId: req.user?.id,
        possibleFarmIds: [req.user?.farmId, req.user?.farm?.id, req.user?.membership?.farmId],
      });

      return res.status(403).json({
        message: 'Usuario sem fazenda vinculada.',
      });
    }

    const format = getRequestedFormat(req);
    ensureSupportedFormat(format);

    console.log('[REPORT] Exportando relatório de tarefas:', { farmId, format, filters: req.query });

    const reportData = await getTaskReportData({
      farmId,
      filters: req.query,
    });

    console.log('[REPORT] Dados obtidos:', { rowCount: reportData.rows.length, farmId });

    if (format === 'csv') {
      return sendCsvResponse(res, reportData.fileName, reportData.rows);
    }

    const pdfBuffer = buildPdfBuffer({
      reportTitle: reportData.reportTitle,
      generatedAt: reportData.generatedAt,
      farm: reportData.farm,
      requestedBy: getRequestedByUser(req),
      filters: reportData.filters,
      rows: reportData.rows,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Report-Row-Count', String(reportData.rows.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${reportData.fileName}.pdf"`
    );

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    const status = getErrorStatus(error);

    if (status === 500) {
      console.error('Erro ao exportar relatorio de tarefas:', error);
    }

    return res.status(status).json({
      message:
        status === 400
          ? error.message
          : 'Erro interno ao exportar relatorio de tarefas.',
    });
  }
}

async function exportEvidenceReport(req, res) {
  try {
    const farmId = getAuthenticatedFarmId(req);

    if (!farmId) {
      console.warn('[REPORT] Tentativa de acesso sem farmId (evidências):', {
        userId: req.user?.id,
        possibleFarmIds: [req.user?.farmId, req.user?.farm?.id, req.user?.membership?.farmId],
      });

      return res.status(403).json({
        message: 'Usuario sem fazenda vinculada.',
      });
    }

    const format = getRequestedFormat(req);
    ensureSupportedFormat(format);

    console.log('[REPORT] Exportando relatório de evidências:', { farmId, format, filters: req.query });

    const reportData = await getEvidenceReportData({
      farmId,
      filters: req.query,
    });

    console.log('[REPORT] Evidências obtidas:', { rowCount: reportData.rows.length, farmId });

    if (format === 'csv') {
      return sendCsvResponse(res, reportData.fileName, reportData.rows);
    }

    const pdfBuffer = buildPdfBuffer({
      reportTitle: reportData.reportTitle,
      generatedAt: reportData.generatedAt,
      farm: reportData.farm,
      requestedBy: getRequestedByUser(req),
      filters: reportData.filters,
      rows: reportData.rows,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Report-Row-Count', String(reportData.rows.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${reportData.fileName}.pdf"`
    );

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    const status = getErrorStatus(error);

    if (status === 500) {
      console.error('Erro ao exportar relatorio de evidencias:', error);
    }

    return res.status(status).json({
      message:
        status === 400
          ? error.message
          : 'Erro interno ao exportar relatorio de evidencias.',
    });
  }
}

module.exports = {
  exportTaskReport,
  exportEvidenceReport,
};
