import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import AppShell from '../../components/AppShell/AppShell';
import './Reports.css';

const TASK_STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'COMPLETED', label: 'Concluida' },
  { value: 'LATE', label: 'Atrasada' },
];

const TASK_PRIORITY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'LOW', label: 'Baixa' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
];

const INITIAL_TASK_FILTERS = {
  startDate: '',
  endDate: '',
  status: '',
  priority: '',
  responsibleId: '',
};

const INITIAL_EVIDENCE_FILTERS = {
  startDate: '',
  endDate: '',
  responsibleId: '',
  taskId: '',
  status: '',
};

function extractFileName(contentDisposition, fallbackFileName) {
  const match = String(contentDisposition || '').match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallbackFileName;
}

function buildParams(filters, format) {
  const params = { format };

  Object.entries(filters).forEach(([key, value]) => {
    if (String(value || '').trim()) {
      params[key] = String(value).trim();
    }
  });

  return params;
}

function buildSuccessMessage(rowCount) {
  if (!Number.isFinite(rowCount)) {
    return 'Relatorio gerado com sucesso.';
  }

  if (rowCount === 0) {
    return 'Relatorio gerado sem registros para os filtros informados.';
  }

  if (rowCount === 1) {
    return 'Relatorio gerado com 1 registro.';
  }

  return `Relatorio gerado com ${rowCount} registros.`;
}

async function readErrorMessage(error) {
  const responseData = error.response?.data;

  if (responseData instanceof Blob) {
    try {
      const text = await responseData.text();
      const parsed = JSON.parse(text);

      if (parsed?.message) {
        return parsed.message;
      }
    } catch (parseError) {
      return '';
    }
  }

  return error.response?.data?.message || '';
}

function downloadBlobFile(blob, fileName) {
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();

  window.setTimeout(() => {
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  }, 300);
}

function Reports() {
  const storedFarm = useMemo(() => {
    return JSON.parse(localStorage.getItem('agrotask_farm') || 'null');
  }, []);

  const [responsibles, setResponsibles] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskFilters, setTaskFilters] = useState(INITIAL_TASK_FILTERS);
  const [evidenceFilters, setEvidenceFilters] = useState(INITIAL_EVIDENCE_FILTERS);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [exportingKey, setExportingKey] = useState('');

  useEffect(() => {
    async function loadOptions() {
      try {
        setLoadingOptions(true);
        setErrorMessage('');

        const [formOptionsResponse, tasksResponse] = await Promise.all([
          api.get('/tasks/form-options'),
          api.get('/tasks'),
        ]);

        setResponsibles(formOptionsResponse.data?.users || []);
        setTasks(tasksResponse.data?.tasks || []);
      } catch (error) {
        const message =
          error.response?.data?.message ||
          'Nao foi possivel carregar as opcoes dos relatorios.';

        setErrorMessage(message);
      } finally {
        setLoadingOptions(false);
      }
    }

    loadOptions();
  }, []);

  const responsibleOptions = useMemo(() => {
    return [
      { id: '', name: 'Todos os responsaveis' },
      ...responsibles.map((user) => ({
        id: String(user.id),
        name: user.name,
      })),
    ];
  }, [responsibles]);

  const taskOptions = useMemo(() => {
    return [
      { id: '', title: 'Todas as tarefas' },
      ...tasks.map((task) => ({
        id: String(task.id),
        title: task.title,
      })),
    ];
  }, [tasks]);

  const updateTaskFilter = (field, value) => {
    setTaskFilters((currentFilters) => ({
      ...currentFilters,
      [field]: value,
    }));
  };

  const updateEvidenceFilter = (field, value) => {
    setEvidenceFilters((currentFilters) => ({
      ...currentFilters,
      [field]: value,
    }));
  };

  const resetTaskFilters = () => {
    setTaskFilters(INITIAL_TASK_FILTERS);
  };

  const resetEvidenceFilters = () => {
    setEvidenceFilters(INITIAL_EVIDENCE_FILTERS);
  };

  const downloadReport = async ({
    endpoint,
    filters,
    format,
    fallbackFileName,
    exportingStateKey,
  }) => {
    try {
      setExportingKey(exportingStateKey);
      setErrorMessage('');
      setSuccessMessage('');

      const response = await api.get(endpoint, {
        params: buildParams(filters, format),
        responseType: 'blob',
      });

      const contentType =
        response.headers['content-type'] ||
        (format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8');
      const fileName = extractFileName(
        response.headers['content-disposition'],
        fallbackFileName
      );
      const rowCount = Number(response.headers['x-report-row-count']);
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: contentType });

      downloadBlobFile(blob, fileName);
      setSuccessMessage(buildSuccessMessage(rowCount));
    } catch (error) {
      const parsedMessage = await readErrorMessage(error);
      const message =
        parsedMessage || 'Nao foi possivel gerar o relatorio solicitado.';

      setErrorMessage(message);
    } finally {
      setExportingKey('');
    }
  };

  return (
    <AppShell title="Relatorios" pageClassName="reports-page">
      <div className="reports-shell">
        <div className="reports-page-header">
          <h2>Relatorios</h2>
          <p>
            Exporte dados gerenciais da fazenda atual em CSV ou PDF, com filtros
            administrativos e escopo restrito a fazenda vinculada.
          </p>
        </div>

        <section className="reports-summary-card">
          <div className="reports-summary-item">
            <span>Fazenda atual</span>
            <strong>{storedFarm?.name || 'Nao identificada'}</strong>
          </div>

          <div className="reports-summary-item">
            <span>Responsaveis disponiveis</span>
            <strong>{responsibles.length}</strong>
          </div>

          <div className="reports-summary-item">
            <span>Tarefas disponiveis</span>
            <strong>{tasks.length}</strong>
          </div>
        </section>

        {loadingOptions && (
          <div className="reports-feedback info">
            Carregando opcoes dos relatorios...
          </div>
        )}

        {errorMessage && (
          <div className="reports-feedback error">{errorMessage}</div>
        )}

        {successMessage && (
          <div className="reports-feedback success">{successMessage}</div>
        )}

        <div className="reports-sections">
          <article className="reports-card">
            <div className="reports-card-header">
              <h3>Relatorio de tarefas</h3>
              <p>
                Filtre por periodo de criacao, status, prioridade e responsavel.
              </p>
            </div>

            <div className="reports-card-body">
              <div className="reports-form-grid">
                <div className="reports-field">
                  <label htmlFor="task-start-date">Periodo inicial</label>
                  <input
                    id="task-start-date"
                    type="date"
                    value={taskFilters.startDate}
                    onChange={(event) =>
                      updateTaskFilter('startDate', event.target.value)
                    }
                  />
                </div>

                <div className="reports-field">
                  <label htmlFor="task-end-date">Periodo final</label>
                  <input
                    id="task-end-date"
                    type="date"
                    value={taskFilters.endDate}
                    onChange={(event) =>
                      updateTaskFilter('endDate', event.target.value)
                    }
                  />
                </div>

                <div className="reports-field">
                  <label htmlFor="task-status">Status</label>
                  <select
                    id="task-status"
                    value={taskFilters.status}
                    onChange={(event) =>
                      updateTaskFilter('status', event.target.value)
                    }
                  >
                    {TASK_STATUS_OPTIONS.map((option) => (
                      <option key={`task-status-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="reports-field">
                  <label htmlFor="task-priority">Prioridade</label>
                  <select
                    id="task-priority"
                    value={taskFilters.priority}
                    onChange={(event) =>
                      updateTaskFilter('priority', event.target.value)
                    }
                  >
                    {TASK_PRIORITY_OPTIONS.map((option) => (
                      <option
                        key={`task-priority-${option.value}`}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="reports-field reports-field--full">
                  <label htmlFor="task-responsible">Responsavel</label>
                  <select
                    id="task-responsible"
                    value={taskFilters.responsibleId}
                    onChange={(event) =>
                      updateTaskFilter('responsibleId', event.target.value)
                    }
                  >
                    {responsibleOptions.map((option) => (
                      <option
                        key={`task-responsible-${option.id}`}
                        value={option.id}
                      >
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="reports-actions">
                <button
                  type="button"
                  className="reports-secondary-button"
                  onClick={resetTaskFilters}
                  disabled={Boolean(exportingKey)}
                >
                  Limpar filtros
                </button>

                <button
                  type="button"
                  className="reports-outline-button"
                  onClick={() =>
                    downloadReport({
                      endpoint: '/reports/tasks/export',
                      filters: taskFilters,
                      format: 'csv',
                      fallbackFileName: 'relatorio-tarefas.csv',
                      exportingStateKey: 'tasks-csv',
                    })
                  }
                  disabled={loadingOptions || Boolean(exportingKey)}
                >
                  {exportingKey === 'tasks-csv' ? 'Gerando CSV...' : 'Exportar CSV'}
                </button>

                <button
                  type="button"
                  className="reports-primary-button"
                  onClick={() =>
                    downloadReport({
                      endpoint: '/reports/tasks/export',
                      filters: taskFilters,
                      format: 'pdf',
                      fallbackFileName: 'relatorio-tarefas.pdf',
                      exportingStateKey: 'tasks-pdf',
                    })
                  }
                  disabled={loadingOptions || Boolean(exportingKey)}
                >
                  {exportingKey === 'tasks-pdf' ? 'Gerando PDF...' : 'Exportar PDF'}
                </button>
              </div>
            </div>
          </article>

          <article className="reports-card">
            <div className="reports-card-header">
              <h3>Relatorio de evidencias</h3>
              <p>
                Filtre por periodo de envio, responsavel, tarefa e status da tarefa.
              </p>
            </div>

            <div className="reports-card-body">
              <div className="reports-form-grid">
                <div className="reports-field">
                  <label htmlFor="evidence-start-date">Periodo inicial</label>
                  <input
                    id="evidence-start-date"
                    type="date"
                    value={evidenceFilters.startDate}
                    onChange={(event) =>
                      updateEvidenceFilter('startDate', event.target.value)
                    }
                  />
                </div>

                <div className="reports-field">
                  <label htmlFor="evidence-end-date">Periodo final</label>
                  <input
                    id="evidence-end-date"
                    type="date"
                    value={evidenceFilters.endDate}
                    onChange={(event) =>
                      updateEvidenceFilter('endDate', event.target.value)
                    }
                  />
                </div>

                <div className="reports-field">
                  <label htmlFor="evidence-responsible">Responsavel</label>
                  <select
                    id="evidence-responsible"
                    value={evidenceFilters.responsibleId}
                    onChange={(event) =>
                      updateEvidenceFilter('responsibleId', event.target.value)
                    }
                  >
                    {responsibleOptions.map((option) => (
                      <option
                        key={`evidence-responsible-${option.id}`}
                        value={option.id}
                      >
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="reports-field">
                  <label htmlFor="evidence-task">Tarefa</label>
                  <select
                    id="evidence-task"
                    value={evidenceFilters.taskId}
                    onChange={(event) =>
                      updateEvidenceFilter('taskId', event.target.value)
                    }
                  >
                    {taskOptions.map((option) => (
                      <option key={`evidence-task-${option.id}`} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="reports-field reports-field--full">
                  <label htmlFor="evidence-status">Status da tarefa</label>
                  <select
                    id="evidence-status"
                    value={evidenceFilters.status}
                    onChange={(event) =>
                      updateEvidenceFilter('status', event.target.value)
                    }
                  >
                    {TASK_STATUS_OPTIONS.map((option) => (
                      <option
                        key={`evidence-status-${option.value}`}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="reports-actions">
                <button
                  type="button"
                  className="reports-secondary-button"
                  onClick={resetEvidenceFilters}
                  disabled={Boolean(exportingKey)}
                >
                  Limpar filtros
                </button>

                <button
                  type="button"
                  className="reports-outline-button"
                  onClick={() =>
                    downloadReport({
                      endpoint: '/reports/evidences/export',
                      filters: evidenceFilters,
                      format: 'csv',
                      fallbackFileName: 'relatorio-evidencias.csv',
                      exportingStateKey: 'evidences-csv',
                    })
                  }
                  disabled={loadingOptions || Boolean(exportingKey)}
                >
                  {exportingKey === 'evidences-csv'
                    ? 'Gerando CSV...'
                    : 'Exportar CSV'}
                </button>

                <button
                  type="button"
                  className="reports-primary-button"
                  onClick={() =>
                    downloadReport({
                      endpoint: '/reports/evidences/export',
                      filters: evidenceFilters,
                      format: 'pdf',
                      fallbackFileName: 'relatorio-evidencias.pdf',
                      exportingStateKey: 'evidences-pdf',
                    })
                  }
                  disabled={loadingOptions || Boolean(exportingKey)}
                >
                  {exportingKey === 'evidences-pdf'
                    ? 'Gerando PDF...'
                    : 'Exportar PDF'}
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </AppShell>
  );
}

export default Reports;
