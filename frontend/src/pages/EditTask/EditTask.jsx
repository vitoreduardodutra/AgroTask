import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { isRequestOfflineError } from '../../services/api';
import { getTaskDetailsCache } from '../../services/offlineTaskDetails';
import {
  enqueueTaskStatusUpdate,
  getPendingTaskStatusCount,
  processPendingTaskStatusQueue,
  updateTaskStatusInOfflineCaches,
} from '../../services/offlineTaskStatusQueue';
import {
  checkConnectivityNow,
  getConnectivitySnapshot,
  startConnectivityMonitoring,
  stopConnectivityMonitoring,
  subscribeToConnectivity,
} from '../../services/connectivityService';
import backIcon from '../../assets/icons/Voltar.svg';
import saveChangesIcon from '../../assets/icons/SalvarAlterações.svg';
import AppShell from '../../components/AppShell/AppShell';
import './EditTask.css';

function EditTask() {
  const { id } = useParams();
  const navigate = useNavigate();
  const storedMembership = JSON.parse(
    localStorage.getItem('agrotask_membership') || '{}'
  );

  const isAdmin = storedMembership.role === 'ADMIN';

  const [users, setUsers] = useState([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [savingTask, setSavingTask] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [connectivity, setConnectivity] = useState(getConnectivitySnapshot());
  const [pendingStatusCount, setPendingStatusCount] = useState(
    getPendingTaskStatusCount()
  );
  const [syncingPendingQueue, setSyncingPendingQueue] = useState(false);

  const previousOnlineRef = useRef(getConnectivitySnapshot().isOnline);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    area: '',
    responsibleId: '',
    deadline: '',
    priority: 'MEDIUM',
    status: 'PENDING',
  });

  const isOffline = !connectivity.isOnline;
  const isCheckingConnection = connectivity.isChecking;
  const isAdminEditDisabled = isAdmin && isOffline;

  const pendingQueueText = useMemo(() => {
    if (pendingStatusCount === 0) {
      return '';
    }

    if (pendingStatusCount === 1) {
      return 'Existe 1 atualização de status pendente de sincronização.';
    }

    return `Existem ${pendingStatusCount} atualizações de status pendentes de sincronização.`;
  }, [pendingStatusCount]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('agrotask_token');
    localStorage.removeItem('agrotask_user');
    localStorage.removeItem('agrotask_farm');
    localStorage.removeItem('agrotask_membership');
    navigate('/', { replace: true });
  }, [navigate]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const formatDateTimeLocal = (value) => {
    if (!value) {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const offset = date.getTimezoneOffset();
    const adjustedDate = new Date(date.getTime() - offset * 60000);

    return adjustedDate.toISOString().slice(0, 16);
  };

  const buildFormDataFromTask = useCallback(
    (task) => ({
      title: task?.title || '',
      description: task?.description || '',
      area: task?.area === 'Sem área informada' ? '' : task?.area || '',
      responsibleId: String(task?.responsible?.id || ''),
      deadline: formatDateTimeLocal(task?.deadlineRaw || task?.deadlineIso || ''),
      priority: task?.priorityValue || 'MEDIUM',
      status: task?.statusValue || 'PENDING',
    }),
    []
  );

  const syncPendingQueue = useCallback(async () => {
    const connectivitySnapshot = getConnectivitySnapshot();

    if (!connectivitySnapshot.isOnline) {
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
            return '1 atualização offline foi sincronizada com sucesso.';
          }

          return `${result.synced} atualizações offline foram sincronizadas com sucesso.`;
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
  }, [handleLogout]);

  const loadPageData = useCallback(async () => {
    try {
      setLoadingPage(true);
      setErrorMessage('');
      setSuccessMessage('');

      const taskResponse = await api.get(`/tasks/${id}`);
      const task = taskResponse.data.task;

      setFormData(buildFormDataFromTask(task));

      if (isAdmin) {
        const formOptionsResponse = await api.get('/tasks/form-options');
        setUsers(formOptionsResponse.data.users || []);
      } else {
        setUsers([]);
      }
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message ||
        'Não foi possível carregar os dados da tarefa.';

      if (status === 401) {
        handleLogout();
        return;
      }

      if (isRequestOfflineError(error)) {
        const cachedData = getTaskDetailsCache(id);

        if (cachedData?.task) {
          setFormData(buildFormDataFromTask(cachedData.task));

          if (isAdmin) {
            setUsers([]);
            setErrorMessage(
              'Você está offline. Os dados locais foram carregados, mas a edição completa da tarefa exige conexão com a internet.'
            );
          } else {
            setSuccessMessage(
              'Você está offline. Os dados locais da tarefa foram carregados e o novo status pode ser salvo para sincronização posterior.'
            );
          }
        } else {
          setErrorMessage(
            'Você está offline e não há dados locais suficientes para carregar esta edição.'
          );
        }
      } else {
        setErrorMessage(message);
      }
    } finally {
      setLoadingPage(false);
    }
  }, [id, isAdmin, handleLogout, buildFormDataFromTask]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    const unsubscribe = subscribeToConnectivity(setConnectivity);

    startConnectivityMonitoring();
    void checkConnectivityNow();
    void syncPendingQueue();

    return () => {
      unsubscribe();
      stopConnectivityMonitoring();
    };
  }, [syncPendingQueue]);

  useEffect(() => {
    const wasOnline = previousOnlineRef.current;

    if (!wasOnline && connectivity.isOnline) {
      void syncPendingQueue();
      void loadPageData();
    }

    previousOnlineRef.current = connectivity.isOnline;
  }, [connectivity.isOnline, loadPageData, syncPendingQueue]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSavingTask(true);
      setErrorMessage('');
      setSuccessMessage('');

      const payload = isAdmin
        ? {
            title: formData.title,
            description: formData.description,
            area: formData.area,
            responsibleId: Number(formData.responsibleId),
            deadline: formData.deadline,
            priority: formData.priority,
            status: formData.status,
          }
        : {
            status: formData.status,
          };

      const response = await api.put(`/tasks/${id}`, payload);

      setSuccessMessage(
        response.data.message || 'Tarefa atualizada com sucesso.'
      );

      setTimeout(() => {
        navigate(`/task-details/${id}`, { replace: true });
      }, 900);
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message || 'Não foi possível atualizar a tarefa.';

      if (status === 401) {
        handleLogout();
        return;
      }

      if (!isAdmin && isRequestOfflineError(error)) {
        enqueueTaskStatusUpdate({
          taskId: id,
          status: formData.status,
        });

        updateTaskStatusInOfflineCaches(id, formData.status);
        setPendingStatusCount(getPendingTaskStatusCount());
        setSuccessMessage(
          'Você está offline. O novo status foi salvo localmente e será sincronizado automaticamente quando a conexão voltar.'
        );

        setTimeout(() => {
          navigate(`/task-details/${id}`, { replace: true });
        }, 1000);

        return;
      }

      if (isAdmin && isRequestOfflineError(error)) {
        setErrorMessage(
          'Você está offline. A edição completa da tarefa exige conexão com a internet.'
        );
        return;
      }

      setErrorMessage(message);
    } finally {
      setSavingTask(false);
    }
  };

  return (
    <AppShell title="Editar Tarefa" pageClassName="edit-task-page">
      <div className="edit-task-shell">
        <div className="edit-task-container">
          <Link to={`/task-details/${id}`} className="edit-task-back-link">
            <img src={backIcon} alt="" className="edit-task-back-icon" />
            <span>Voltar</span>
          </Link>

          <div className="edit-task-page-header">
            <h2>{isAdmin ? 'Editar tarefa' : 'Atualizar status da tarefa'}</h2>
            <p>
              {isAdmin
                ? 'Atualize as informações da tarefa abaixo'
                : 'Como funcionário, você pode alterar apenas o status da tarefa'}
            </p>
          </div>

          <div className={`edit-task-connection-banner ${isOffline ? 'offline' : 'online'}`}>
            <span className="edit-task-connection-dot" />
            <div className="edit-task-connection-text">
              <strong>
                {isCheckingConnection
                  ? 'Verificando conexão'
                  : isOffline
                  ? 'Modo offline'
                  : 'Online'}
              </strong>
              <span>
                {isCheckingConnection
                  ? 'Validando se o backend do AgroTask está acessível neste dispositivo...'
                  : isOffline
                  ? isAdmin
                    ? 'Sem conexão utilizável com o sistema. A edição completa da tarefa fica indisponível offline.'
                    : 'Sem conexão utilizável com o sistema. Você ainda pode salvar o status, e a sincronização acontecerá quando a conexão voltar.'
                  : syncingPendingQueue
                  ? 'Conexão ativa. Verificando sincronização de status pendentes...'
                  : 'Conexão ativa. As alterações são enviadas normalmente e os status pendentes podem ser sincronizados.'}
              </span>
            </div>
          </div>

          {pendingStatusCount > 0 && (
            <div className="edit-task-feedback offline-queue">
              {pendingQueueText}
            </div>
          )}

          {errorMessage && (
            <div className="edit-task-feedback error">{errorMessage}</div>
          )}

          {successMessage && (
            <div className="edit-task-feedback success">{successMessage}</div>
          )}

          {loadingPage ? (
            <div className="edit-task-feedback info">
              Carregando dados da tarefa...
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <section className="edit-task-card">
                <div className="edit-task-card-header">
                  <h3>IDENTIFICAÇÃO</h3>
                </div>

                <div className="edit-task-card-body">
                  <div className="edit-task-field">
                    <label htmlFor="titulo">
                      Título <span>*</span>
                    </label>
                    <input
                      id="titulo"
                      type="text"
                      value={formData.title}
                      onChange={(event) =>
                        handleChange('title', event.target.value)
                      }
                      placeholder="Ex: Aplicação de defensivo – Talhão 4"
                      required
                      disabled={!isAdmin || isAdminEditDisabled}
                    />
                  </div>

                  <div className="edit-task-field">
                    <label htmlFor="descricao">
                      Descrição <span>*</span>
                    </label>
                    <textarea
                      id="descricao"
                      rows="5"
                      placeholder="Descreva detalhadamente o que deve ser feito, incluindo procedimentos e observações relevantes"
                      value={formData.description}
                      onChange={(event) =>
                        handleChange('description', event.target.value)
                      }
                      required
                      disabled={!isAdmin || isAdminEditDisabled}
                    />
                  </div>

                  <div className="edit-task-field">
                    <label htmlFor="area">Área / Local</label>
                    <input
                      id="area"
                      type="text"
                      value={formData.area}
                      onChange={(event) =>
                        handleChange('area', event.target.value)
                      }
                      placeholder="Ex: Pastagem A, Talhão 4, Galpão 2"
                      disabled={!isAdmin || isAdminEditDisabled}
                    />
                  </div>
                </div>
              </section>

              <section className="edit-task-card">
                <div className="edit-task-card-header">
                  <h3>RESPONSABILIDADE E PRAZO</h3>
                </div>

                <div className="edit-task-card-body edit-task-grid">
                  <div className="edit-task-field">
                    <label htmlFor="responsavel">
                      Responsável <span>*</span>
                    </label>
                    <select
                      id="responsavel"
                      value={formData.responsibleId}
                      onChange={(event) =>
                        handleChange('responsibleId', event.target.value)
                      }
                      required
                      disabled={!isAdmin || isAdminEditDisabled}
                    >
                      <option value="">Selecione um responsável</option>

                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="edit-task-field">
                    <label htmlFor="prazo">
                      Prazo <span>*</span>
                    </label>
                    <input
                      id="prazo"
                      type="datetime-local"
                      value={formData.deadline}
                      onChange={(event) =>
                        handleChange('deadline', event.target.value)
                      }
                      required
                      disabled={!isAdmin || isAdminEditDisabled}
                    />
                  </div>
                </div>
              </section>

              <section className="edit-task-card">
                <div className="edit-task-card-header">
                  <h3>CLASSIFICAÇÃO</h3>
                </div>

                <div className="edit-task-card-body">
                  <div className="edit-task-classification-grid">
                    <div className="edit-task-priority-block">
                      <label className="edit-task-section-label">
                        Prioridade
                      </label>

                      <div className="edit-task-priority-options">
                        <button
                          type="button"
                          className={`priority-option ${
                            formData.priority === 'LOW' ? 'active low' : ''
                          }`}
                          onClick={() => handleChange('priority', 'LOW')}
                          disabled={!isAdmin || isAdminEditDisabled}
                        >
                          Baixa
                        </button>

                        <button
                          type="button"
                          className={`priority-option ${
                            formData.priority === 'MEDIUM'
                              ? 'active medium'
                              : ''
                          }`}
                          onClick={() => handleChange('priority', 'MEDIUM')}
                          disabled={!isAdmin || isAdminEditDisabled}
                        >
                          Média
                        </button>

                        <button
                          type="button"
                          className={`priority-option ${
                            formData.priority === 'HIGH' ? 'active high' : ''
                          }`}
                          onClick={() => handleChange('priority', 'HIGH')}
                          disabled={!isAdmin || isAdminEditDisabled}
                        >
                          Alta
                        </button>
                      </div>
                    </div>

                    <div className="edit-task-status-block">
                      <label className="edit-task-section-label">Status</label>

                      <div className="edit-task-status-options">
                        <button
                          type="button"
                          className={`status-option pending ${
                            formData.status === 'PENDING' ? 'active' : ''
                          }`}
                          onClick={() => handleChange('status', 'PENDING')}
                        >
                          <span className="status-option-left">
                            <span className="status-dot" />
                            <span>Pendente</span>
                          </span>
                          {formData.status === 'PENDING' && (
                            <span className="status-check">✓</span>
                          )}
                        </button>

                        <button
                          type="button"
                          className={`status-option progress ${
                            formData.status === 'IN_PROGRESS'
                              ? 'active'
                              : ''
                          }`}
                          onClick={() => handleChange('status', 'IN_PROGRESS')}
                        >
                          <span className="status-option-left">
                            <span className="status-dot" />
                            <span>Em andamento</span>
                          </span>
                          {formData.status === 'IN_PROGRESS' && (
                            <span className="status-check">✓</span>
                          )}
                        </button>

                        <button
                          type="button"
                          className={`status-option completed ${
                            formData.status === 'COMPLETED' ? 'active' : ''
                          }`}
                          onClick={() => handleChange('status', 'COMPLETED')}
                        >
                          <span className="status-option-left">
                            <span className="status-dot" />
                            <span>Concluída</span>
                          </span>
                          {formData.status === 'COMPLETED' && (
                            <span className="status-check">✓</span>
                          )}
                        </button>

                        <button
                          type="button"
                          className={`status-option late ${
                            formData.status === 'LATE' ? 'active' : ''
                          }`}
                          onClick={() => handleChange('status', 'LATE')}
                        >
                          <span className="status-option-left">
                            <span className="status-dot" />
                            <span>Atrasada</span>
                          </span>
                          {formData.status === 'LATE' && (
                            <span className="status-check">✓</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="edit-task-actions">
                <button
                  type="submit"
                  className="edit-task-save-button"
                  disabled={savingTask || (isAdmin && isOffline)}
                >
                  <img
                    src={saveChangesIcon}
                    alt=""
                    className="edit-task-save-icon"
                  />
                  <span>
                    {savingTask
                      ? 'Salvando...'
                      : isAdmin
                      ? 'Salvar alterações'
                      : 'Salvar status'}
                  </span>
                </button>

                <Link
                  to={`/task-details/${id}`}
                  className="edit-task-cancel-button"
                >
                  Cancelar
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default EditTask;