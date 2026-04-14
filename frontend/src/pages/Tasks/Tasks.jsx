import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { isRequestOfflineError } from '../../services/api';
import {
  getTasksCache,
  saveTasksCache,
  formatCacheDateTime,
} from '../../services/offlineTasks';
import {
  getPendingTaskStatusCount,
  processPendingTaskStatusQueue,
} from '../../services/offlineTaskStatusQueue';
import newTaskIcon from '../../assets/icons/NovaTarefa.svg';
import filtersIcon from '../../assets/icons/Filtros.svg';
import tableSortIcon from '../../assets/icons/TRPSP.svg';
import AppShell from '../../components/AppShell/AppShell';
import './Tasks.css';

function Tasks() {
  const navigate = useNavigate();
  const storedMembership = JSON.parse(
    localStorage.getItem('agrotask_membership') || '{}'
  );

  const [showFilters, setShowFilters] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [tasks, setTasks] = useState([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [showOfflineCacheMessage, setShowOfflineCacheMessage] = useState(false);
  const [offlineCacheTimestamp, setOfflineCacheTimestamp] = useState('');
  const [pendingStatusCount, setPendingStatusCount] = useState(
    getPendingTaskStatusCount()
  );
  const [syncingPendingQueue, setSyncingPendingQueue] = useState(false);

  const isAdmin = storedMembership.role === 'ADMIN';

  const handleLogout = () => {
    localStorage.removeItem('agrotask_token');
    localStorage.removeItem('agrotask_user');
    localStorage.removeItem('agrotask_farm');
    localStorage.removeItem('agrotask_membership');
    navigate('/', { replace: true });
  };

  const clearFilters = () => {
    setSearchValue('');
    setStatusFilter('');
    setPriorityFilter('');
  };

  const syncPendingQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setPendingStatusCount(getPendingTaskStatusCount());
      return;
    }

    try {
      setSyncingPendingQueue(true);

      const result = await processPendingTaskStatusQueue(api);

      setPendingStatusCount(getPendingTaskStatusCount());

      if (result.synced > 0) {
        setSuccessMessage((currentMessage) => {
          if (currentMessage) {
            return currentMessage;
          }

          if (result.synced === 1) {
            return '1 atualização pendente foi sincronizada com sucesso.';
          }

          return `${result.synced} atualizações pendentes foram sincronizadas com sucesso.`;
        });
      }
    } catch (error) {
      const status = error.response?.status;

      if (status === 401) {
        handleLogout();
      }
    } finally {
      setSyncingPendingQueue(false);
    }
  }, [navigate]);

  const loadTasks = useCallback(async () => {
    const filters = {
      search: searchValue,
      status: statusFilter,
      priority: priorityFilter,
    };

    try {
      setLoading(true);
      setErrorMessage('');
      setShowOfflineCacheMessage(false);
      setOfflineCacheTimestamp('');

      const response = await api.get('/tasks', {
        params: filters,
      });

      const responseTasks = response.data.tasks || [];
      const responseTotal = response.data.total || 0;

      setTasks(responseTasks);
      setTotalTasks(responseTotal);
      saveTasksCache({
        filters,
        tasks: responseTasks,
        total: responseTotal,
      });
      setPendingStatusCount(getPendingTaskStatusCount());
    } catch (error) {
      const status = error.response?.status;

      if (status === 401) {
        handleLogout();
        return;
      }

      if (isRequestOfflineError(error)) {
        const cachedData = getTasksCache(filters);

        if (cachedData) {
          setTasks(cachedData.tasks || []);
          setTotalTasks(cachedData.total || 0);
          setShowOfflineCacheMessage(true);
          setOfflineCacheTimestamp(cachedData.cachedAt || '');
          setErrorMessage('');
        } else {
          setTasks([]);
          setTotalTasks(0);
          setShowOfflineCacheMessage(false);
          setOfflineCacheTimestamp('');
          setErrorMessage(
            'Você está sem internet e não há tarefas salvas em cache para estes filtros.'
          );
        }

        setPendingStatusCount(getPendingTaskStatusCount());
        return;
      }

      const message =
        error.response?.data?.message ||
        'Não foi possível carregar as tarefas.';

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [searchValue, statusFilter, priorityFilter, navigate]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setTaskToDelete(null);
      }
    };

    if (taskToDelete) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [taskToDelete]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      await syncPendingQueue();
      await loadTasks();
    };

    const handleOffline = () => {
      setIsOffline(true);
      setPendingStatusCount(getPendingTaskStatusCount());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    syncPendingQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadTasks, syncPendingQueue]);

  const handleOpenDeleteModal = (event, task) => {
    event.stopPropagation();
    setTaskToDelete(task);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleCloseDeleteModal = () => {
    if (deletingTaskId) {
      return;
    }

    setTaskToDelete(null);
  };

  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete) {
      return;
    }

    try {
      setDeletingTaskId(taskToDelete.id);
      setErrorMessage('');
      setSuccessMessage('');

      const response = await api.delete(`/tasks/${taskToDelete.id}`);

      setSuccessMessage(
        response.data.message || 'Tarefa excluída com sucesso.'
      );
      setTaskToDelete(null);

      await loadTasks();
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message ||
        'Não foi possível excluir a tarefa.';

      if (status === 401) {
        handleLogout();
        return;
      }

      if (isRequestOfflineError(error)) {
        setErrorMessage(
          'Você está offline. Conecte-se à internet para excluir tarefas.'
        );
        return;
      }

      setErrorMessage(message);
    } finally {
      setDeletingTaskId(null);
    }
  };

  const hasActiveFilters = Boolean(
    searchValue.trim() || statusFilter || priorityFilter
  );

  const filteredTasksText = useMemo(() => {
    if (loading) {
      return 'Carregando tarefas...';
    }

    if (hasActiveFilters) {
      return `${totalTasks} tarefa(s) encontrada(s) com os filtros aplicados`;
    }

    return `${totalTasks} tarefas encontradas`;
  }, [loading, totalTasks, hasActiveFilters]);

  const offlineCacheText = useMemo(() => {
    if (!offlineCacheTimestamp) {
      return '';
    }

    const formattedDate = formatCacheDateTime(offlineCacheTimestamp);

    if (!formattedDate) {
      return '';
    }

    return `Última atualização local em ${formattedDate}.`;
  }, [offlineCacheTimestamp]);

  const pendingQueueText = useMemo(() => {
    if (pendingStatusCount === 0) {
      return '';
    }

    if (pendingStatusCount === 1) {
      return 'Existe 1 atualização de status pendente de sincronização.';
    }

    return `Existem ${pendingStatusCount} atualizações de status pendentes de sincronização.`;
  }, [pendingStatusCount]);

  return (
    <AppShell title="Tarefas" pageClassName="tasks-page">
      <div className="tasks-shell">
        <div className="tasks-header-block">
          <div className="tasks-title-group">
            <h2>Tarefas</h2>
            <p>{filteredTasksText}</p>
          </div>

          {isAdmin && (
            <Link to="/new-task" className="tasks-new-button">
              <img src={newTaskIcon} alt="" className="tasks-new-button-icon" />
              <span>Nova tarefa</span>
            </Link>
          )}
        </div>

        <div className={`tasks-connection-banner ${isOffline ? 'offline' : 'online'}`}>
          <span className="tasks-connection-dot" />
          <div className="tasks-connection-text">
            <strong>{isOffline ? 'Modo offline' : 'Online'}</strong>
            <span>
              {isOffline
                ? 'Sem conexão com a internet. O sistema tentará usar os dados salvos neste dispositivo.'
                : syncingPendingQueue
                ? 'Conexão ativa. Sincronizando alterações pendentes de status...'
                : 'Conexão ativa. As tarefas são carregadas normalmente e salvas localmente.'}
            </span>
          </div>
        </div>

        {pendingStatusCount > 0 && (
          <div className="tasks-feedback offline-queue">
            {pendingQueueText}
          </div>
        )}

        {showOfflineCacheMessage && (
          <div className="tasks-feedback offline-cache">
            Exibindo tarefas salvas localmente para estes filtros.{' '}
            {offlineCacheText}
          </div>
        )}

        <section className="tasks-filters-card">
          <div className="tasks-search-row">
            <div className="tasks-search-box">
              <span className="tasks-search-icon">⌕</span>
              <input
                type="text"
                placeholder="Buscar por título, responsável ou área..."
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
            </div>

            <button
              type="button"
              className={`tasks-filter-toggle ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters((prev) => !prev)}
            >
              <img
                src={filtersIcon}
                alt=""
                className="tasks-filter-toggle-icon"
              />
              <span>Filtros</span>
            </button>
          </div>

          {showFilters && (
            <div className="tasks-expanded-filters">
              <div className="tasks-filter-field">
                <label htmlFor="status">Status:</label>
                <select
                  id="status"
                  className="tasks-filter-select"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="PENDING">Pendente</option>
                  <option value="IN_PROGRESS">Em andamento</option>
                  <option value="COMPLETED">Concluída</option>
                  <option value="LATE">Atrasada</option>
                </select>
              </div>

              <div className="tasks-filter-field">
                <label htmlFor="priority">Prioridade:</label>
                <select
                  id="priority"
                  className="tasks-filter-select"
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="LOW">Baixa</option>
                  <option value="MEDIUM">Média</option>
                  <option value="HIGH">Alta</option>
                </select>
              </div>

              <button
                type="button"
                className="tasks-clear-filters"
                onClick={clearFilters}
              >
                Limpar filtros
              </button>
            </div>
          )}
        </section>

        {errorMessage && (
          <div className="tasks-feedback error">{errorMessage}</div>
        )}

        {successMessage && (
          <div className="tasks-feedback success">{successMessage}</div>
        )}

        <section className="tasks-table-card">
          <div
            className={`tasks-table-header ${isAdmin ? 'with-actions' : ''}`}
          >
            <div className="tasks-col title">
              <span>Título</span>
              <img src={tableSortIcon} alt="" className="tasks-sort-icon" />
            </div>

            <div className="tasks-col responsible">
              <span>Responsável</span>
              <img src={tableSortIcon} alt="" className="tasks-sort-icon" />
            </div>

            <div className="tasks-col priority">
              <span>Prioridade</span>
              <img src={tableSortIcon} alt="" className="tasks-sort-icon" />
            </div>

            <div className="tasks-col status">
              <span>Status</span>
              <img src={tableSortIcon} alt="" className="tasks-sort-icon" />
            </div>

            <div className="tasks-col deadline">
              <span>Prazo</span>
              <img src={tableSortIcon} alt="" className="tasks-sort-icon" />
            </div>

            {isAdmin && (
              <div className="tasks-col actions">
                <span>Ações</span>
              </div>
            )}
          </div>

          <div className="tasks-table-body">
            {loading && (
              <div className="tasks-empty-message">Carregando tarefas...</div>
            )}

            {!loading && tasks.length === 0 && (
              <div className="tasks-empty-message">
                Nenhuma tarefa encontrada.
              </div>
            )}

            {!loading &&
              tasks.map((task) => (
                <article
                  className={`tasks-row ${isAdmin ? 'with-actions' : ''}`}
                  key={task.id}
                  onClick={() => navigate(`/task-details/${task.id}`)}
                >
                  <div className="tasks-col title">
                    <div className="tasks-title-cell">
                      <strong>{task.title}</strong>
                      <span>{task.area}</span>
                    </div>
                  </div>

                  <div className="tasks-col responsible">
                    <div className="tasks-responsible-cell">
                      <div className="tasks-responsible-avatar">
                        {task.initials}
                      </div>
                      <span>{task.responsible}</span>
                    </div>
                  </div>

                  <div className="tasks-col priority">
                    <span className={`tasks-pill priority ${task.priorityClass}`}>
                      {task.priority}
                    </span>
                  </div>

                  <div className="tasks-col status">
                    <div className="tasks-status-cell">
                      <span className={`tasks-pill status ${task.statusClass}`}>
                        <span className="tasks-status-dot" />
                        {task.status}
                      </span>

                      {task.hasOfflinePendingStatus && (
                        <span className="tasks-pending-sync-tag">
                          Pendente de sincronização
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="tasks-col deadline">
                    <span
                      className={`tasks-deadline ${
                        task.deadlineHighlight ? 'highlight' : ''
                      }`}
                    >
                      {task.deadline}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="tasks-col actions">
                      <button
                        type="button"
                        className="tasks-delete-button"
                        onClick={(event) => handleOpenDeleteModal(event, task)}
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </article>
              ))}
          </div>

          <div className="tasks-table-footer">
            {loading
              ? 'Exibindo 0 de 0 tarefas'
              : `Exibindo ${tasks.length} de ${totalTasks} tarefas`}
          </div>
        </section>
      </div>

      {taskToDelete && (
        <div
          className="tasks-modal-overlay"
          onClick={handleCloseDeleteModal}
        >
          <div
            className="tasks-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tasks-modal-header">
              <h3>Excluir tarefa</h3>
            </div>

            <div className="tasks-modal-body">
              <p>
                Tem certeza que deseja excluir a tarefa{' '}
                <strong>{taskToDelete.title}</strong>?
              </p>
              <span>
                Essa ação também remove evidências e histórico vinculados.
              </span>
            </div>

            <div className="tasks-modal-actions">
              <button
                type="button"
                className="tasks-modal-cancel"
                onClick={handleCloseDeleteModal}
                disabled={Boolean(deletingTaskId)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="tasks-modal-confirm"
                onClick={handleConfirmDeleteTask}
                disabled={deletingTaskId === taskToDelete.id}
              >
                {deletingTaskId === taskToDelete.id
                  ? 'Excluindo...'
                  : 'Excluir tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default Tasks;