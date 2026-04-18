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
  const [rejectionFormOpen, setRejectionFormOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [connectivity, setConnectivity] = useState(getConnectivitySnapshot());
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [showOfflineCacheMessage, setShowOfflineCacheMessage] = useState(false);
  const [offlineCacheTimestamp, setOfflineCacheTimestamp] = useState('');
  const [pendingStatusCount, setPendingStatusCount] = useState(
    getPendingTaskStatusCount()
  );
  const [syncingPendingQueue, setSyncingPendingQueue] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speakingTask, setSpeakingTask] = useState(false);

  const previousOnlineRef = useRef(getConnectivitySnapshot().isOnline);
  const speechUtteranceRef = useRef(null);

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

  const hasEvidenceRequirements = useMemo(() => {
    return (
      task?.requirePhotoEvidence ||
      task?.requireNoteEvidence ||
      task?.requireLocationEvidence
    );
  }, [task]);

  const validationRequirementsCount = useMemo(() => {
    if (!task) {
      return 0;
    }

    return [
      task.completionRequiresApproval,
      task.requirePhotoEvidence,
      task.requireNoteEvidence,
      task.requireLocationEvidence,
    ].filter(Boolean).length;
  }, [task]);

  const validationRequirementCards = useMemo(() => {
    if (!task) {
      return [];
    }

    return [
      {
        key: 'approval',
        title: 'Aprovação do administrador',
        description: task.completionRequiresApproval
          ? 'A conclusão fica pendente até a revisão do administrador.'
          : 'A conclusão pode seguir sem revisão adicional.',
        enabled: Boolean(task.completionRequiresApproval),
      },
      {
        key: 'photo',
        title: 'Foto obrigatória',
        description: task.requirePhotoEvidence
          ? 'O funcionário precisa enviar foto como evidência de execução.'
          : 'Foto não é obrigatória para esta tarefa.',
        enabled: Boolean(task.requirePhotoEvidence),
      },
      {
        key: 'note',
        title: 'Observação obrigatória',
        description: task.requireNoteEvidence
          ? 'É necessário registrar uma observação ao concluir.'
          : 'Observação não é obrigatória para esta tarefa.',
        enabled: Boolean(task.requireNoteEvidence),
      },
      {
        key: 'location',
        title: 'Localização obrigatória',
        description: task.requireLocationEvidence
          ? 'É necessário capturar a localização da execução.'
          : 'Localização não é obrigatória para esta tarefa.',
        enabled: Boolean(task.requireLocationEvidence),
      },
    ];
  }, [task]);

  const completionReviewToneClass = useMemo(() => {
    if (!task) {
      return 'idle';
    }

    if (task.completionReviewStatusValue === 'PENDING') {
      return 'pending';
    }

    if (task.completionReviewStatusValue === 'APPROVED') {
      return 'approved';
    }

    if (task.completionReviewStatusValue === 'REJECTED') {
      return 'returned';
    }

    return 'idle';
  }, [task]);

  const completionReviewTitle = useMemo(() => {
    if (!task) {
      return '';
    }

    if (task.completionReviewStatusValue === 'PENDING') {
      return 'Conclusão aguardando validação';
    }

    if (task.completionReviewStatusValue === 'APPROVED') {
      return 'Conclusão aprovada';
    }

    if (task.completionReviewStatusValue === 'REJECTED') {
      return 'Conclusão devolvida para ajuste';
    }

    return 'Sem revisão ativa no momento';
  }, [task]);

  const completionReviewDescription = useMemo(() => {
    if (!task) {
      return '';
    }

    if (task.completionReviewStatusValue === 'PENDING') {
      return 'A tarefa foi marcada para conclusão e está aguardando a decisão do administrador.';
    }

    if (task.completionReviewStatusValue === 'APPROVED') {
      return 'A conclusão foi validada e a tarefa foi aceita dentro das regras definidas.';
    }

    if (task.completionReviewStatusValue === 'REJECTED') {
      return 'A conclusão foi analisada e devolvida para que o responsável realize os ajustes necessários.';
    }

    return 'Ainda não existe uma revisão de conclusão em andamento para esta tarefa.';
  }, [task]);

  const visibleHistories = useMemo(() => {
    const histories = Array.isArray(task?.histories) ? task.histories : [];

    if (showFullHistory) {
      return histories;
    }

    return histories.slice(0, 5);
  }, [task, showFullHistory]);

  const hasHiddenHistories = useMemo(() => {
    const totalHistories = Array.isArray(task?.histories) ? task.histories.length : 0;
    return totalHistories > 5;
  }, [task]);

  const taskSpeechText = useMemo(() => {
  if (!task) {
    return '';
  }

  const speechParts = [];

  speechParts.push(`Tarefa: ${task.title}.`);

  if (task.description) {
    speechParts.push(`Descrição: ${task.description}.`);
  }

  speechParts.push(`Status atual: ${task.status}.`);
  speechParts.push(`Prioridade: ${task.priority}.`);
  speechParts.push(
    `Responsável: ${task.responsible?.name || 'Sem responsável definido'}.`
  );
  speechParts.push(
    `Prazo: ${task.deadlineLong || task.deadline || 'Não informado'}.`
  );
  speechParts.push(`Área: ${task.area || 'Sem área informada'}.`);

  const validationRules = [];

  if (task.completionRequiresApproval) {
    validationRules.push('aprovação do administrador');
  }

  if (task.requirePhotoEvidence) {
    validationRules.push('envio de foto');
  }

  if (task.requireNoteEvidence) {
    validationRules.push('observação obrigatória');
  }

  if (task.requireLocationEvidence) {
    validationRules.push('captura de localização');
  }

  if (validationRules.length === 1) {
    speechParts.push(
      `Regra de validação: esta tarefa exige ${validationRules[0]}.`
    );
  }

  if (validationRules.length > 1) {
    const lastRule = validationRules[validationRules.length - 1];
    const initialRules = validationRules.slice(0, -1).join(', ');

    speechParts.push(
      `Regras de validação: esta tarefa exige ${initialRules} e ${lastRule}.`
    );
  }

  return speechParts.join(' ');
}, [task]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('agrotask_token');
    localStorage.removeItem('agrotask_user');
    localStorage.removeItem('agrotask_farm');
    localStorage.removeItem('agrotask_membership');
    navigate('/', { replace: true });
  }, [navigate]);

  const stopTaskSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
    setSpeakingTask(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setSpeechSupported(Boolean(window.speechSynthesis));

    return () => {
      stopTaskSpeech();
    };
  }, [stopTaskSpeech]);

  const handleSpeakTask = () => {
  if (!speechSupported || !taskSpeechText) {
    setErrorMessage(
      'A leitura por voz não está disponível neste navegador.'
    );
    return;
  }

  if (speakingTask) {
    stopTaskSpeech();
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(taskSpeechText);
    const availableVoices = window.speechSynthesis.getVoices();

    const preferredVoice =
      availableVoices.find((voice) => voice.lang?.toLowerCase().includes('pt-br')) ||
      availableVoices.find((voice) => voice.lang?.toLowerCase().includes('pt')) ||
      null;

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.lang = preferredVoice?.lang || 'pt-BR';
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      setSpeakingTask(true);
      setErrorMessage('');
    };

    utterance.onend = () => {
      setSpeakingTask(false);
      speechUtteranceRef.current = null;
    };

    utterance.onerror = () => {
      setSpeakingTask(false);
      speechUtteranceRef.current = null;
      setErrorMessage(
        'Não foi possível reproduzir a leitura da tarefa neste momento.'
      );
    };

    speechUtteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    setErrorMessage(
      'Não foi possível iniciar a leitura por voz agora.'
    );
    setSpeakingTask(false);
  }
  };

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
      setRejectionFormOpen(false);
      setRejectionReason('');

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

  const openRejectForm = () => {
    setErrorMessage('');
    setSuccessFeedbackMessage('');
    setRejectionFormOpen(true);
    setRejectionReason(task?.completionRejectionReason || '');
  };

  const closeRejectForm = () => {
    if (reviewingCompletion) {
      return;
    }

    setRejectionFormOpen(false);
    setRejectionReason('');
  };

  const handleRejectCompletion = async () => {
    if (!rejectionReason.trim()) {
      setErrorMessage('Informe um motivo para devolver a conclusão.');
      return;
    }

    try {
      setReviewingCompletion(true);
      setErrorMessage('');
      setSuccessFeedbackMessage('');

      const response = await api.post(`/tasks/${id}/review-completion`, {
        decision: 'REJECT',
        reason: rejectionReason.trim(),
      });

      setSuccessFeedbackMessage(
        response.data.message || 'Conclusão devolvida para ajuste com sucesso.'
      );

      setRejectionFormOpen(false);
      setRejectionReason('');

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
              <button
                type="button"
                className={`task-details-outline-button task-details-voice-button ${
                  speakingTask ? 'is-speaking' : ''
                }`}
                onClick={handleSpeakTask}
                disabled={!speechSupported || !task}
              >
                <span className="task-details-voice-button-icon">🔊</span>
                <span>{speakingTask ? 'Parar leitura' : 'Ouvir tarefa'}</span>
              </button>

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

                    <div className="task-details-validation-block" style={{ padding: 0, border: 'none', background: 'transparent' }}>
                      <div className="task-details-validation-summary">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <strong>Validação configurada para esta tarefa</strong>
                          <span>
                            As regras abaixo definem o que precisa ser atendido para que a conclusão seja aceita.
                          </span>
                        </div>

                        <div className="task-details-validation-count">
                          {validationRequirementsCount > 0
                            ? `${validationRequirementsCount} requisito${validationRequirementsCount > 1 ? 's' : ''}`
                            : 'Sem requisitos extras'}
                        </div>
                      </div>

                      <div className="task-details-validation-rule-list">
                        {validationRequirementCards.map((requirement) => (
                          <div
                            key={requirement.key}
                            className={`task-details-validation-rule-item ${
                              requirement.enabled ? 'required' : 'disabled'
                            }`}
                          >
                            <div className="task-details-validation-rule-content">
                              <strong>{requirement.title}</strong>
                              <span>{requirement.description}</span>
                              <div
                                className={`task-details-validation-rule-badge ${
                                  requirement.enabled ? 'required' : 'optional'
                                }`}
                              >
                                {requirement.enabled ? 'Obrigatório' : 'Não exigido'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {task.completionRequiresApproval && (
                <section className="task-details-card">
                  <div className="task-details-section-header">
                    <h3>Validação da conclusão</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="task-details-review-block">
                      <div className={`task-details-review-status ${completionReviewToneClass}`}>
                        <div className="task-details-review-status-banner">
                          {task.completionReviewStatusLabel}
                        </div>

                        <div className="task-details-review-status-body">
                          <div className="task-details-review-status-title">
                            {completionReviewTitle}
                          </div>

                          <div className="task-details-review-status-text">
                            {completionReviewDescription}
                          </div>
                        </div>

                        <div className="task-details-review-meta">
                          <div className="task-details-review-meta-chip">
                            Status da tarefa: {task.status}
                          </div>

                          {task.completionReviewedByName && (
                            <div className="task-details-review-meta-chip">
                              Revisado por {task.completionReviewedByName}
                            </div>
                          )}

                          {task.completionReviewedAtFull && (
                            <div className="task-details-review-meta-chip">
                              {task.completionReviewedAtFull}
                            </div>
                          )}
                        </div>
                      </div>

                      {task.completionRejectionReason && (
                        <div className="task-details-review-reason">
                          <span className="task-details-review-reason-label">
                            Motivo da devolução
                          </span>
                          <p>{task.completionRejectionReason}</p>
                        </div>
                      )}

                      {!task.completionRejectionReason &&
                        task.completionReviewStatusValue !== 'PENDING' &&
                        task.completionReviewStatusValue !== 'APPROVED' && (
                          <div className="task-details-review-empty">
                            <strong>Nenhum retorno registrado</strong>
                            <span>
                              Quando houver uma revisão, o histórico desta validação aparecerá aqui com mais clareza.
                            </span>
                          </div>
                        )}
                    </div>

                    {task.canReviewCompletion && isAdmin && (
                      <div className="task-details-review-block">
                        <div className="task-details-review-empty">
                          <strong>Ações de validação</strong>
                          <span>
                            Revise a conclusão enviada pelo funcionário e escolha se deseja aprovar ou devolver para ajuste.
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <button
                            type="button"
                            className="task-details-primary-button"
                            onClick={handleApproveCompletion}
                            disabled={reviewingCompletion}
                            style={{ width: '100%', minHeight: 52 }}
                          >
                            <span>
                              {reviewingCompletion
                                ? 'Processando...'
                                : 'Aprovar conclusão'}
                            </span>
                          </button>

                          {!rejectionFormOpen ? (
                            <button
                              type="button"
                              className="task-details-outline-button"
                              onClick={openRejectForm}
                              disabled={reviewingCompletion}
                              style={{
                                width: '100%',
                                minHeight: 52,
                                color: '#b91c1c',
                                borderColor: '#fecaca',
                                background: '#fffafa',
                              }}
                            >
                              <span>Devolver para ajuste</span>
                            </button>
                          ) : (
                            <div
                              className="task-details-review-reason"
                              style={{
                                borderColor: '#fecaca',
                                background: '#fffafa',
                                gap: 12,
                              }}
                            >
                              <span className="task-details-review-reason-label">
                                Motivo do ajuste
                              </span>

                              <textarea
                                value={rejectionReason}
                                onChange={(event) => setRejectionReason(event.target.value)}
                                placeholder="Explique com clareza o que precisa ser ajustado para a conclusão ser aprovada."
                                rows={4}
                                disabled={reviewingCompletion}
                                style={{
                                  width: '100%',
                                  resize: 'vertical',
                                  minHeight: 110,
                                  borderRadius: 14,
                                  border: '1px solid #f3c2c2',
                                  padding: '14px 16px',
                                  boxSizing: 'border-box',
                                  fontSize: 14,
                                  lineHeight: 1.6,
                                  color: '#344054',
                                  background: '#ffffff',
                                  outline: 'none',
                                }}
                              />

                              <div
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <button
                                  type="button"
                                  className="task-details-outline-button"
                                  onClick={closeRejectForm}
                                  disabled={reviewingCompletion}
                                  style={{ minHeight: 48, minWidth: 120 }}
                                >
                                  <span>Cancelar</span>
                                </button>

                                <button
                                  type="button"
                                  className="task-details-primary-button"
                                  onClick={handleRejectCompletion}
                                  disabled={reviewingCompletion}
                                  style={{
                                    minHeight: 48,
                                    minWidth: 180,
                                    background: '#dc2626',
                                  }}
                                >
                                  <span>
                                    {reviewingCompletion
                                      ? 'Enviando...'
                                      : 'Confirmar devolução'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                  <>
                    <div className="task-details-history-list">
                      {visibleHistories.map((history) => (
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

                    {hasHiddenHistories && (
                      <button
                        type="button"
                        className="task-details-add-link"
                        onClick={() => setShowFullHistory((currentValue) => !currentValue)}
                        style={{
                          marginTop: 18,
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <span>
                          {showFullHistory
                            ? 'Mostrar menos alterações'
                            : `Ver mais ${task.histories.length - visibleHistories.length} alterações`}
                        </span>
                      </button>
                    )}
                  </>
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
