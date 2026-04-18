import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { isRequestOfflineError } from '../../services/api';
import {
  getTaskDetailsCache,
  saveTaskDetailsCache,
  formatTaskDetailsCacheDateTime,
} from '../../services/offlineTaskDetails';
import {
  getPendingTaskStatusCount,
  processPendingTaskStatusQueue,
} from '../../services/offlineTaskStatusQueue';
import {
  checkConnectivityNow,
  getConnectivitySnapshot,
  startConnectivityMonitoring,
  stopConnectivityMonitoring,
  subscribeToConnectivity,
} from '../../services/connectivityService';
import backIcon from '../../assets/icons/Voltar.svg';
import responsibleIcon from '../../assets/icons/Responsável.svg';
import deadlineIcon from '../../assets/icons/Prazo.svg';
import areaIcon from '../../assets/icons/Área.svg';
import createdAtIcon from '../../assets/icons/CriadaEm.svg';
import historyIcon from '../../assets/icons/HistóricoDeAlterações.svg';
import mediumIcon from '../../assets/icons/Média.svg';
import editTaskIcon from '../../assets/icons/EditarTarefa.svg';
import evidencesIcon from '../../assets/icons/Evidências.svg';
import AppShell from '../../components/AppShell/AppShell';
import './TaskDetails.css';

function TaskDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const storedMembership = JSON.parse(
    localStorage.getItem('agrotask_membership') || '{}'
  );

  const isAdmin = storedMembership.role === 'ADMIN';

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successFeedbackMessage, setSuccessFeedbackMessage] = useState('');
  const [previewEvidence, setPreviewEvidence] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState(null);
  const [reviewingCompletion, setReviewingCompletion] = useState(false);
  const [connectivity, setConnectivity] = useState(getConnectivitySnapshot());
  const [showOfflineCacheMessage, setShowOfflineCacheMessage] = useState(false);
  const [offlineCacheTimestamp, setOfflineCacheTimestamp] = useState('');
  const [pendingStatusCount, setPendingStatusCount] = useState(
    getPendingTaskStatusCount()
  );
  const [syncingPendingQueue, setSyncingPendingQueue] = useState(false);

  const previousOnlineRef = useRef(getConnectivitySnapshot().isOnline);

  const isOffline = !connectivity.isOnline;
  const isCheckingConnection = connectivity.isChecking;

  const apiBaseUrl = useMemo(() => {
    return (api.defaults.baseURL || '').replace(/\/$/, '');
  }, []);

  const offlineCacheText = useMemo(() => {
    if (!offlineCacheTimestamp) {
      return '';
    }

    const formattedDate = formatTaskDetailsCacheDateTime(offlineCacheTimestamp);

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

  const handleLogout = useCallback(() => {
    localStorage.removeItem('agrotask_token');
    localStorage.removeItem('agrotask_user');
    localStorage.removeItem('agrotask_farm');
    localStorage.removeItem('agrotask_membership');
    navigate('/', { replace: true });
  }, [navigate]);

  const getPriorityIcon = (priorityValue) => {
    if (priorityValue === 'MEDIUM') {
      return mediumIcon;
    }

    return null;
  };

  const buildEvidenceUrl = (filePath) => {
    if (!filePath) {
      return '';
    }

    if (/^https?:\/\//i.test(filePath)) {
      return filePath;
    }

    const normalizedPath = String(filePath)
      .replace(/^backend[\\/]/i, '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');

    return `${apiBaseUrl}/${normalizedPath}`;
  };

  const isPreviewableImage = (evidence) => {
    return evidence?.fileType?.toLowerCase().startsWith('image/');
  };

  const closeEvidencePreview = () => {
    setPreviewEvidence((currentEvidence) => {
      if (currentEvidence?.blobUrl) {
        window.URL.revokeObjectURL(currentEvidence.blobUrl);
      }

      return null;
    });

    setPreviewLoading(false);
  };

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
        setSuccessFeedbackMessage(
          result.synced === 1
            ? '1 atualização pendente foi sincronizada com sucesso.'
            : `${result.synced} atualizações pendentes foram sincronizadas com sucesso.`
        );
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

  const openEvidencePreview = async (evidence) => {
    if (!evidence) {
      return;
    }

    if (isOffline) {
      setErrorMessage(
        'Você está offline. A visualização detalhada da evidência precisa de conexão com a internet.'
      );
      return;
    }

    const previewable = isPreviewableImage(evidence);
    const evidenceUrl = buildEvidenceUrl(evidence.filePath);

    const baseEvidence = {
      ...evidence,
      url: evidenceUrl,
      previewable,
      blobUrl: '',
    };

    setPreviewEvidence(baseEvidence);

    if (!previewable) {
      return;
    }

    try {
      setPreviewLoading(true);
      setErrorMessage('');

      const response = await api.get(evidence.filePath, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: evidence.fileType || 'application/octet-stream',
      });

      const blobUrl = window.URL.createObjectURL(blob);

      setPreviewEvidence((currentEvidence) => {
        if (!currentEvidence || currentEvidence.id !== evidence.id) {
          window.URL.revokeObjectURL(blobUrl);
          return currentEvidence;
        }

        if (currentEvidence.blobUrl) {
          window.URL.revokeObjectURL(currentEvidence.blobUrl);
        }

        return {
          ...currentEvidence,
          blobUrl,
        };
      });
    } catch (error) {
      if (isRequestOfflineError(error)) {
        setErrorMessage(
          'Você está offline. A visualização detalhada da evidência precisa de conexão com a internet.'
        );
      } else {
        setErrorMessage('Não foi possível carregar a visualização da evidência.');
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadEvidence = async (event, evidence) => {
    event.preventDefault();
    event.stopPropagation();

    if (isOffline) {
      setErrorMessage(
        'Você está offline. Conecte-se à internet para baixar a evidência.'
      );
      return;
    }

    try {
      setDownloadingEvidenceId(evidence.id);
      setErrorMessage('');

      const response = await api.get(evidence.filePath, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: evidence.fileType || 'application/octet-stream',
      });

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = blobUrl;
      link.download = evidence.fileName || 'evidencia';
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      if (isRequestOfflineError(error)) {
        setErrorMessage(
          'Você está offline. Conecte-se à internet para baixar a evidência.'
        );
      } else {
        setErrorMessage('Não foi possível baixar a evidência.');
      }
    } finally {
      setDownloadingEvidenceId(null);
    }
  };

  const loadTaskDetails = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      setShowOfflineCacheMessage(false);
      setOfflineCacheTimestamp('');

      const response = await api.get(`/tasks/${id}`);
      const responseTask = response.data.task || null;

      setTask(responseTask);

      if (responseTask) {
        saveTaskDetailsCache(id, responseTask);
      }

      setPendingStatusCount(getPendingTaskStatusCount());
    } catch (error) {
      const status = error.response?.status;

      if (status === 401) {
        handleLogout();
        return;
      }

      if (isRequestOfflineError(error)) {
        const cachedData = getTaskDetailsCache(id);

        if (cachedData?.task) {
          setTask(cachedData.task);
          setShowOfflineCacheMessage(true);
          setOfflineCacheTimestamp(cachedData.cachedAt || '');
          setErrorMessage('');
        } else {
          setTask(null);
          setShowOfflineCacheMessage(false);
          setOfflineCacheTimestamp('');
          setErrorMessage(
            'Você está sem internet e não há detalhes salvos em cache para esta tarefa.'
          );
        }

        setPendingStatusCount(getPendingTaskStatusCount());
        return;
      }

      const message =
        error.response?.data?.message ||
        'Não foi possível carregar os detalhes da tarefa.';

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [id, handleLogout]);

  useEffect(() => {
    loadTaskDetails();
  }, [loadTaskDetails]);

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
      void loadTaskDetails();
    }

    previousOnlineRef.current = connectivity.isOnline;
  }, [connectivity.isOnline, loadTaskDetails, syncPendingQueue]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeEvidencePreview();
      }
    };

    if (previewEvidence) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [previewEvidence]);

  useEffect(() => {
    return () => {
      setPreviewEvidence((currentEvidence) => {
        if (currentEvidence?.blobUrl) {
          window.URL.revokeObjectURL(currentEvidence.blobUrl);
        }

        return null;
      });
    };
  }, []);

  const handleApproveCompletion = async () => {
    try {
      setReviewingCompletion(true);
      setErrorMessage('');
      setSuccessFeedbackMessage('');

      const response = await api.post(`/tasks/${id}/review-completion`, {
        decision: 'APPROVE',
      });

      setSuccessFeedbackMessage(
        response.data.message || 'Conclusão aprovada com sucesso.'
      );

      await loadTaskDetails();
    } catch (error) {
      const message =
        error.response?.data?.message ||
        'Não foi possível aprovar a conclusão da tarefa.';
      setErrorMessage(message);
    } finally {
      setReviewingCompletion(false);
    }
  };

  const handleRejectCompletion = async () => {
    const reason = window.prompt(
      'Informe o motivo da devolução para ajuste:'
    );

    if (reason === null) {
      return;
    }

    if (!reason.trim()) {
      setErrorMessage('Informe um motivo para devolver a conclusão.');
      return;
    }

    try {
      setReviewingCompletion(true);
      setErrorMessage('');
      setSuccessFeedbackMessage('');

      const response = await api.post(`/tasks/${id}/review-completion`, {
        decision: 'REJECT',
        reason: reason.trim(),
      });

      setSuccessFeedbackMessage(
        response.data.message || 'Conclusão devolvida para ajuste com sucesso.'
      );

      await loadTaskDetails();
    } catch (error) {
      const message =
        error.response?.data?.message ||
        'Não foi possível devolver a conclusão para ajuste.';
      setErrorMessage(message);
    } finally {
      setReviewingCompletion(false);
    }
  };

  const hasEvidenceRequirements =
    task?.requirePhotoEvidence ||
    task?.requireNoteEvidence ||
    task?.requireLocationEvidence;

  return (
    <AppShell title="Detalhes da Tarefa" pageClassName="task-details-page">
      <div className="task-details-shell">
        <div className="task-details-container">
          <div className="task-details-toolbar">
            <Link to="/tasks" className="task-details-back-link">
              <img src={backIcon} alt="" className="task-details-back-icon" />
              <span>Voltar</span>
            </Link>

            <div className="task-details-toolbar-actions">
              <Link to={`/evidences/${id}`} className="task-details-outline-button">
                <img
                  src={evidencesIcon}
                  alt=""
                  className="task-details-toolbar-button-icon"
                />
                <span>Evidências</span>
              </Link>

              <Link to={`/edit-task/${id}`} className="task-details-primary-button">
                <img
                  src={editTaskIcon}
                  alt=""
                  className="task-details-toolbar-button-icon"
                />
                <span>{isAdmin ? 'Editar' : 'Atualizar status'}</span>
              </Link>
            </div>
          </div>

          <div
            className={`task-details-connection-banner ${
              isOffline ? 'offline' : 'online'
            }`}
          >
            <span className="task-details-connection-dot" />
            <div className="task-details-connection-text">
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
                  ? 'Sem conexão utilizável com o sistema. O app tentará usar os detalhes salvos neste dispositivo.'
                  : syncingPendingQueue
                  ? 'Conexão ativa. Sincronizando alterações pendentes de status...'
                  : 'Conexão ativa. Os detalhes da tarefa são carregados normalmente e salvos localmente.'}
              </span>
            </div>
          </div>

          {pendingStatusCount > 0 && (
            <div className="task-details-feedback offline-queue">
              {pendingQueueText}
            </div>
          )}

          {showOfflineCacheMessage && (
            <div className="task-details-feedback offline-cache">
              Exibindo detalhes salvos localmente para esta tarefa.{' '}
              {offlineCacheText}
            </div>
          )}

          {successFeedbackMessage && (
            <div className="task-details-feedback success">
              {successFeedbackMessage}
            </div>
          )}

          {errorMessage && (
            <div className="task-details-feedback error">{errorMessage}</div>
          )}

          {loading && (
            <div className="task-details-feedback info">
              Carregando detalhes da tarefa...
            </div>
          )}

          {!loading && !errorMessage && !task && (
            <div className="task-details-feedback info">
              Tarefa não encontrada.
            </div>
          )}

          {!loading && task && (
            <>
              <section className="task-details-card">
                <div className="task-details-status-row">
                  <span className={`task-badge status ${task.statusClass}`}>
                    {task.status}
                  </span>

                  <span className={`task-badge priority ${task.priorityClass}`}>
                    {getPriorityIcon(task.priorityValue) && (
                      <img
                        src={getPriorityIcon(task.priorityValue)}
                        alt=""
                        className="task-badge-icon"
                      />
                    )}
                    <span>{task.priority}</span>
                  </span>

                  {task.hasOfflinePendingStatus && (
                    <span className="task-details-pending-sync-tag">
                      Status pendente de sincronização
                    </span>
                  )}
                </div>

                <h2 className="task-details-title">{task.title}</h2>

                <div className="task-details-info-box">
                  <span className="task-details-info-label">DESCRIÇÃO</span>
                  <p>{task.description}</p>
                </div>

                {(task.completionRequiresApproval || hasEvidenceRequirements) && (
                  <div
                    style={{
                      marginTop: 22,
                      paddingTop: 22,
                      borderTop: '1px solid #edf1f6',
                    }}
                  >
                    <span className="task-details-info-label">REGRAS DE VALIDAÇÃO</span>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        color: '#475467',
                        fontSize: 15,
                        lineHeight: 1.6,
                      }}
                    >
                      <span>
                        {task.completionRequiresApproval
                          ? 'A conclusão desta tarefa exige aprovação do administrador.'
                          : 'A conclusão desta tarefa não exige aprovação adicional.'}
                      </span>

                      {hasEvidenceRequirements ? (
                        <span>
                          Evidências obrigatórias:{' '}
                          {task.evidenceRequirements.join(', ')}.
                        </span>
                      ) : (
                        <span>Não há exigências específicas de evidência para a conclusão.</span>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {task.completionRequiresApproval && (
                <section className="task-details-card">
                  <h3>Validação da conclusão</h3>

                  <div className="task-details-empty-state" style={{ paddingTop: 0 }}>
                    Status da validação: <strong>{task.completionReviewStatusLabel}</strong>
                  </div>

                  {task.completionReviewedByName && (
                    <div className="task-details-empty-state">
                      Revisado por {task.completionReviewedByName} em {task.completionReviewedAtFull}.
                    </div>
                  )}

                  {task.completionRejectionReason && (
                    <div className="task-details-feedback error" style={{ marginTop: 16, marginBottom: 0 }}>
                      Motivo da devolução: {task.completionRejectionReason}
                    </div>
                  )}

                  {task.canReviewCompletion && isAdmin && (
                    <div className="task-details-actions" style={{ marginTop: 18 }}>
                      <button
                        type="button"
                        className="task-details-action-item"
                        onClick={handleApproveCompletion}
                        disabled={reviewingCompletion}
                        style={{
                          border: 'none',
                          cursor: reviewingCompletion ? 'not-allowed' : 'pointer',
                          background: '#ecfdf3',
                          color: '#166534',
                        }}
                      >
                        <span>
                          {reviewingCompletion ? 'Processando...' : 'Aprovar conclusão'}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="task-details-action-item"
                        onClick={handleRejectCompletion}
                        disabled={reviewingCompletion}
                        style={{
                          border: 'none',
                          cursor: reviewingCompletion ? 'not-allowed' : 'pointer',
                          background: '#fef2f2',
                          color: '#b91c1c',
                        }}
                      >
                        <span>Devolver para ajuste</span>
                      </button>
                    </div>
                  )}
                </section>
              )}

              <section className="task-details-card">
                <div className="task-details-section-header">
                  <h3>
                    <img
                      src={historyIcon}
                      alt=""
                      className="task-details-section-icon"
                    />
                    <span>Histórico de alterações</span>
                  </h3>
                </div>

                {task.histories.length === 0 ? (
                  <div className="task-details-empty-state">
                    Nenhum histórico registrado.
                  </div>
                ) : (
                  <div className="task-details-history-list">
                    {task.histories.map((history) => (
                      <div className="task-details-history-item" key={history.id}>
                        <span className="history-dot" />
                        <div>
                          <strong>{history.action}</strong>
                          <span>
                            {history.userName} · {history.createdAtFull}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="task-details-card">
                <div className="task-details-section-header-between">
                  <h3>
                    <img
                      src={evidencesIcon}
                      alt=""
                      className="task-details-section-icon"
                    />
                    <span>Evidências</span>
                  </h3>

                  <Link to={`/evidences/${id}`} className="task-details-add-link">
                    <span>Adicionar</span>
                  </Link>
                </div>

                {task.evidences.length === 0 ? (
                  <div className="task-details-empty-evidence">
                    <img
                      src={evidencesIcon}
                      alt=""
                      className="task-details-empty-evidence-icon"
                    />
                    <p>Nenhuma evidência enviada</p>
                    <span>Clique para adicionar</span>
                  </div>
                ) : (
                  <div className="task-details-evidence-grid">
                    {task.evidences.map((evidence) => (
                      <div
                        className="task-details-evidence-card task-details-evidence-card-clickable"
                        key={evidence.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openEvidencePreview(evidence)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openEvidencePreview(evidence);
                          }
                        }}
                        aria-label={`Abrir evidência ${evidence.fileName}`}
                      >
                        <strong>{evidence.fileName}</strong>

                        <span>
                          {evidence.note || 'Sem observação informada'}
                        </span>

                        <small>Enviado em {evidence.createdAt}</small>

                        <div className="task-details-evidence-hint">
                          Clique para visualizar
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="task-details-card">
                <h3>Informações</h3>

                <div className="task-details-info-list">
                  <div className="task-details-info-item">
                    <div className="task-details-info-item-icon-wrap">
                      <img
                        src={responsibleIcon}
                        alt=""
                        className="task-details-info-item-icon"
                      />
                    </div>

                    <div className="task-details-info-item-content">
                      <strong>Responsável</strong>

                      <div className="task-details-info-value with-avatar">
                        <span className="task-details-info-avatar">
                          {task.responsible.initials}
                        </span>
                        <span>{task.responsible.name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="task-details-info-item">
                    <div className="task-details-info-item-icon-wrap">
                      <img
                        src={deadlineIcon}
                        alt=""
                        className="task-details-info-item-icon"
                      />
                    </div>

                    <div className="task-details-info-item-content">
                      <strong>Prazo</strong>
                      <span className="task-details-info-value">
                        {task.deadlineLong}
                      </span>
                    </div>
                  </div>

                  <div className="task-details-info-item">
                    <div className="task-details-info-item-icon-wrap">
                      <img
                        src={areaIcon}
                        alt=""
                        className="task-details-info-item-icon"
                      />
                    </div>

                    <div className="task-details-info-item-content">
                      <strong>Área</strong>
                      <span className="task-details-info-value">{task.area}</span>
                    </div>
                  </div>

                  <div className="task-details-info-item">
                    <div className="task-details-info-item-icon-wrap">
                      <img
                        src={createdAtIcon}
                        alt=""
                        className="task-details-info-item-icon"
                      />
                    </div>

                    <div className="task-details-info-item-content">
                      <strong>Criada em</strong>
                      <span className="task-details-info-value">
                        {task.createdAtFull}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="task-details-card">
                <h3>Ações rápidas</h3>

                <div className="task-details-actions">
                  <Link to={`/edit-task/${id}`} className="task-details-action-item">
                    <img
                      src={editTaskIcon}
                      alt=""
                      className="task-details-action-icon dark"
                    />
                    <span>{isAdmin ? 'Editar tarefa' : 'Atualizar status'}</span>
                  </Link>

                  <Link to={`/evidences/${id}`} className="task-details-action-item">
                    <img
                      src={evidencesIcon}
                      alt=""
                      className="task-details-action-icon"
                    />
                    <span>Gerenciar evidências</span>
                  </Link>
                </div>
              </section>

              <div className="task-details-id">ID da tarefa: #{task.code}</div>
            </>
          )}
        </div>
      </div>

      {previewEvidence && (
        <div
          className="task-details-preview-overlay"
          onClick={closeEvidencePreview}
        >
          <div
            className="task-details-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="task-details-preview-header">
              <div className="task-details-preview-header-text">
                <h3>{previewEvidence.fileName}</h3>
                <span>
                  {previewEvidence.fileType || 'Arquivo'} •{' '}
                  {previewEvidence.createdAt || '--'}
                </span>
              </div>

              <button
                type="button"
                className="task-details-preview-close"
                onClick={closeEvidencePreview}
                aria-label="Fechar visualização"
              >
                ×
              </button>
            </div>

            <div className="task-details-preview-body">
              {previewLoading ? (
                <div className="task-details-preview-unavailable">
                  <strong>Carregando visualização...</strong>
                  <span>Aguarde um instante.</span>
                </div>
              ) : previewEvidence.previewable ? (
                previewEvidence.blobUrl ? (
                  <img
                    src={previewEvidence.blobUrl}
                    alt={previewEvidence.fileName}
                    className="task-details-preview-image"
                  />
                ) : (
                  <div className="task-details-preview-unavailable">
                    <strong>Não foi possível montar a visualização da imagem.</strong>
                    <span>
                      Você ainda pode baixar a evidência normalmente pelo botão
                      abaixo.
                    </span>
                  </div>
                )
              ) : (
                <div className="task-details-preview-unavailable">
                  <strong>Visualização indisponível para este tipo de arquivo.</strong>
                  <span>
                    Você ainda pode baixar a evidência normalmente pelo botão
                    abaixo.
                  </span>
                </div>
              )}
            </div>

            <div className="task-details-preview-footer">
              <div className="task-details-preview-note">
                {previewEvidence.note || 'Sem observação informada.'}
              </div>

              <button
                type="button"
                className="task-details-download-button"
                onClick={(event) =>
                  handleDownloadEvidence(event, previewEvidence)
                }
                disabled={downloadingEvidenceId === previewEvidence.id}
              >
                {downloadingEvidenceId === previewEvidence.id
                  ? 'Baixando...'
                  : 'Baixar arquivo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default TaskDetails;