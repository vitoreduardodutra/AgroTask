import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import backIcon from '../../assets/icons/Voltar.svg';
import uploadEvidenceIcon from '../../assets/icons/EnviarEvidência.svg';
import confirmUploadIcon from '../../assets/icons/ConfirmarEnvio.svg';
import evidencesIcon from '../../assets/icons/Evidências.svg';
import deleteIcon from '../../assets/icons/Lixeira.svg';
import AppShell from '../../components/AppShell/AppShell';
import './Evidences.css';

function Evidences() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [note, setNote] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [sendingEvidence, setSendingEvidence] = useState(false);
  const [deletingEvidenceId, setDeletingEvidenceId] = useState(null);
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState(null);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [capturedLocation, setCapturedLocation] = useState({
    latitude: null,
    longitude: null,
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [previewEvidence, setPreviewEvidence] = useState(null);

  const apiBaseUrl = useMemo(() => {
    return (api.defaults.baseURL || '').replace(/\/$/, '');
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('agrotask_token');
    localStorage.removeItem('agrotask_user');
    localStorage.removeItem('agrotask_farm');
    localStorage.removeItem('agrotask_membership');
    navigate('/', { replace: true });
  };

  const loadTaskDetails = async () => {
    try {
      setLoadingPage(true);
      setErrorMessage('');

      const response = await api.get(`/tasks/${id}`);
      setTask(response.data.task || null);
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message ||
        'Não foi possível carregar as evidências da tarefa.';

      if (status === 401 || status === 403) {
        handleLogout();
        return;
      }

      setErrorMessage(message);
    } finally {
      setLoadingPage(false);
    }
  };

  useEffect(() => {
    loadTaskDetails();
  }, [id]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPreviewEvidence(null);
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

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleCaptureLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocalização não suportada neste dispositivo.');
      return;
    }

    setCapturingLocation(true);
    setErrorMessage('');
    setSuccessMessage('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCapturedLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setCapturingLocation(false);
      },
      () => {
        setCapturingLocation(false);
        setErrorMessage(
          'Não foi possível capturar a localização atual. Verifique a permissão do navegador.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  };

  const hasExistingPhotoEvidence = useMemo(() => {
    return task?.evidences?.some((item) =>
      String(item.fileType || '').toLowerCase().startsWith('image/')
    );
  }, [task]);

  const hasExistingNoteEvidence = useMemo(() => {
    return task?.evidences?.some((item) => String(item.note || '').trim());
  }, [task]);

  const hasExistingLocationEvidence = useMemo(() => {
    return task?.evidences?.some(
      (item) =>
        item.latitude !== null &&
        item.latitude !== undefined &&
        item.longitude !== null &&
        item.longitude !== undefined
    );
  }, [task]);

  const handleSubmitEvidence = async () => {
    try {
      if (!selectedFile) {
        setErrorMessage('Selecione um arquivo antes de confirmar o envio.');
        setSuccessMessage('');
        return;
      }

      if (
        task?.requirePhotoEvidence &&
        !hasExistingPhotoEvidence &&
        !String(selectedFile.type || '').toLowerCase().startsWith('image/')
      ) {
        setErrorMessage(
          'Esta tarefa exige pelo menos uma evidência com foto. Selecione uma imagem.'
        );
        setSuccessMessage('');
        return;
      }

      if (
        task?.requireNoteEvidence &&
        !hasExistingNoteEvidence &&
        !String(note || '').trim()
      ) {
        setErrorMessage(
          'Esta tarefa exige pelo menos uma evidência com observação. Preencha a observação para continuar.'
        );
        setSuccessMessage('');
        return;
      }

      if (
        task?.requireLocationEvidence &&
        !hasExistingLocationEvidence &&
        (
          capturedLocation.latitude === null ||
          capturedLocation.longitude === null
        )
      ) {
        setErrorMessage(
          'Esta tarefa exige pelo menos uma evidência com localização. Capture a localização antes de enviar.'
        );
        setSuccessMessage('');
        return;
      }

      setSendingEvidence(true);
      setErrorMessage('');
      setSuccessMessage('');

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('note', note);

      if (
        capturedLocation.latitude !== null &&
        capturedLocation.longitude !== null
      ) {
        formData.append('latitude', String(capturedLocation.latitude));
        formData.append('longitude', String(capturedLocation.longitude));
      }

      const response = await api.post(`/tasks/${id}/evidences`, formData);

      setSuccessMessage(
        response.data.message || 'Evidência enviada com sucesso.'
      );
      setSelectedFile(null);
      setNote('');
      setCapturedLocation({
        latitude: null,
        longitude: null,
      });

      const fileInput = document.getElementById('arquivo');
      if (fileInput) {
        fileInput.value = '';
      }

      await loadTaskDetails();
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message ||
        error.message ||
        'Não foi possível enviar a evidência.';

      if (status === 401 || status === 403) {
        handleLogout();
        return;
      }

      setErrorMessage(message);
      setSuccessMessage('');
    } finally {
      setSendingEvidence(false);
    }
  };

  const handleDeleteEvidence = async (evidenceId) => {
    try {
      setDeletingEvidenceId(evidenceId);
      setErrorMessage('');
      setSuccessMessage('');

      const response = await api.delete(`/tasks/${id}/evidences/${evidenceId}`);

      setSuccessMessage(
        response.data.message || 'Evidência removida com sucesso.'
      );

      if (previewEvidence?.id === evidenceId) {
        setPreviewEvidence(null);
      }

      await loadTaskDetails();
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message ||
        'Não foi possível remover a evidência.';

      if (status === 401 || status === 403) {
        handleLogout();
        return;
      }

      setErrorMessage(message);
      setSuccessMessage('');
    } finally {
      setDeletingEvidenceId(null);
    }
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

  const openEvidencePreview = (evidence) => {
    if (!evidence) {
      return;
    }

    const evidenceUrl = buildEvidenceUrl(evidence.filePath);

    setPreviewEvidence({
      ...evidence,
      url: evidenceUrl,
      previewable: isPreviewableImage(evidence),
    });
  };

  const handleDownloadEvidence = async (event, evidence) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      setDownloadingEvidenceId(evidence.id);
      setErrorMessage('');
      setSuccessMessage('');

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
      setErrorMessage('Não foi possível baixar a evidência.');
    } finally {
      setDownloadingEvidenceId(null);
    }
  };

  return (
    <AppShell title="Evidências" pageClassName="evidences-page">
      <div className="evidences-shell">
        <div className="evidences-container">
          <Link to={`/task-details/${id}`} className="evidences-back-link">
            <img src={backIcon} alt="" className="evidences-back-icon" />
            <span>Voltar para detalhes</span>
          </Link>

          <div className="evidences-page-header">
            <h2>Evidências</h2>
            <p>
              {loadingPage
                ? 'Carregando tarefa...'
                : task?.title || 'Tarefa não encontrada'}
            </p>
          </div>

          {errorMessage && (
            <div className="evidences-feedback error">{errorMessage}</div>
          )}

          {successMessage && (
            <div className="evidences-feedback success">{successMessage}</div>
          )}

          {loadingPage ? (
            <div className="evidences-feedback info">
              Carregando evidências...
            </div>
          ) : (
            <>
              <section className="evidences-tips-card">
                <h3>Regras desta tarefa</h3>

                <ul className="evidences-tips-list">
                  <li>
                    Aprovação de conclusão:{' '}
                    {task?.completionRequiresApproval ? 'obrigatória' : 'não obrigatória'}
                  </li>
                  <li>
                    Evidência com foto:{' '}
                    {task?.requirePhotoEvidence ? 'obrigatória' : 'não obrigatória'}
                  </li>
                  <li>
                    Evidência com observação:{' '}
                    {task?.requireNoteEvidence ? 'obrigatória' : 'não obrigatória'}
                  </li>
                  <li>
                    Evidência com localização:{' '}
                    {task?.requireLocationEvidence ? 'obrigatória' : 'não obrigatória'}
                  </li>
                </ul>
              </section>

              <section className="evidences-card">
                <div className="evidences-card-header">
                  <h3>Enviar evidência</h3>
                </div>

                <div className="evidences-card-body">
                  <label htmlFor="arquivo" className="evidences-upload-area">
                    <input
                      id="arquivo"
                      type="file"
                      className="evidences-file-input"
                      onChange={handleFileChange}
                    />

                    <div className="evidences-upload-icon-box">
                      <img
                        src={uploadEvidenceIcon}
                        alt=""
                        className="evidences-upload-icon"
                      />
                    </div>

                    <strong>Arraste ou clique para selecionar</strong>
                    <span>Imagens, PDF, Excel ou Word — até 10 MB</span>

                    {selectedFile && (
                      <small className="evidences-selected-file">
                        Arquivo selecionado: {selectedFile.name}
                      </small>
                    )}
                  </label>

                  <div className="evidences-field">
                    <label htmlFor="observacao">Observação</label>
                    <textarea
                      id="observacao"
                      rows="4"
                      placeholder="Adicione uma observação sobre esta evidência..."
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>

                  <div className="evidences-field">
                    <label>Localização</label>

                    <button
                      type="button"
                      className="evidences-submit-button"
                      onClick={handleCaptureLocation}
                      disabled={capturingLocation}
                      style={{ maxWidth: 260 }}
                    >
                      <img
                        src={confirmUploadIcon}
                        alt=""
                        className="evidences-submit-icon"
                      />
                      <span>
                        {capturingLocation
                          ? 'Capturando...'
                          : 'Capturar localização'}
                      </span>
                    </button>

                    {capturedLocation.latitude !== null &&
                      capturedLocation.longitude !== null && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: '12px 14px',
                            borderRadius: 14,
                            background: '#f8fafc',
                            border: '1px solid #e5e7eb',
                            color: '#475467',
                            fontSize: 14,
                            lineHeight: 1.6,
                          }}
                        >
                          Local capturado: {capturedLocation.latitude.toFixed(6)} /{' '}
                          {capturedLocation.longitude.toFixed(6)}
                        </div>
                      )}
                  </div>

                  <button
                    type="button"
                    className="evidences-submit-button"
                    onClick={handleSubmitEvidence}
                    disabled={sendingEvidence}
                  >
                    <img
                      src={confirmUploadIcon}
                      alt=""
                      className="evidences-submit-icon"
                    />
                    <span>
                      {sendingEvidence ? 'Enviando...' : 'Confirmar envio'}
                    </span>
                  </button>
                </div>
              </section>

              <section className="evidences-tips-card">
                <h3>Boas práticas para evidências</h3>

                <ul className="evidences-tips-list">
                  <li>Fotografe antes, durante e após a operação</li>
                  <li>Garanta boa iluminação e enquadramento</li>
                  <li>Inclua observações descritivas e detalhadas</li>
                  <li>Envie documentos relevantes como notas e receituários</li>
                </ul>
              </section>

              <section className="evidences-card evidences-sent-card">
                <div className="evidences-sent-header">
                  <h3 className="evidences-sent-title">
                    <img
                      src={evidencesIcon}
                      alt=""
                      className="evidences-sent-title-icon"
                    />
                    <span>Evidências enviadas</span>
                  </h3>

                  <span className="evidences-count">
                    {task?.evidences?.length || 0}
                  </span>
                </div>

                {!task?.evidences?.length ? (
                  <div className="evidences-empty-state">
                    Nenhuma evidência enviada ainda.
                  </div>
                ) : (
                  <div className="evidences-sent-list">
                    {task.evidences.map((item) => (
                      <article
                        className="evidences-file-card evidences-file-card-clickable"
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openEvidencePreview(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openEvidencePreview(item);
                          }
                        }}
                        aria-label={`Abrir evidência ${item.fileName}`}
                      >
                        <div className="evidences-file-left">
                          <div className="evidences-file-icon-box">
                            <img
                              src={evidencesIcon}
                              alt=""
                              className="evidences-file-icon"
                            />
                          </div>

                          <div className="evidences-file-info">
                            <strong>{item.fileName}</strong>

                            <div className="evidences-file-meta">
                              <span>{item.fileType || 'N/A'}</span>
                              <span>•</span>
                              <span>{item.authorName || 'Usuário'}</span>
                              <span>•</span>
                              <span>{item.createdAt}</span>
                            </div>

                            <p>{item.note || 'Sem observação informada.'}</p>

                            {(item.latitude !== null &&
                              item.latitude !== undefined &&
                              item.longitude !== null &&
                              item.longitude !== undefined) && (
                              <p style={{ marginTop: 6 }}>
                                Localização: {item.latitude.toFixed(6)} / {item.longitude.toFixed(6)}
                              </p>
                            )}

                            <span className="evidences-file-preview-hint">
                              Clique para visualizar
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="evidences-file-delete"
                          aria-label="Remover evidência"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteEvidence(item.id);
                          }}
                          disabled={deletingEvidenceId === item.id}
                        >
                          <img
                            src={deleteIcon}
                            alt=""
                            className="evidences-file-delete-icon"
                          />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {previewEvidence && (
        <div
          className="evidences-preview-overlay"
          onClick={() => setPreviewEvidence(null)}
        >
          <div
            className="evidences-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="evidences-preview-header">
              <div className="evidences-preview-header-text">
                <h3>{previewEvidence.fileName}</h3>
                <span>
                  {previewEvidence.fileType || 'Arquivo'} •{' '}
                  {previewEvidence.createdAt || '--'}
                </span>
              </div>

              <button
                type="button"
                className="evidences-preview-close"
                onClick={() => setPreviewEvidence(null)}
                aria-label="Fechar visualização"
              >
                ×
              </button>
            </div>

            <div className="evidences-preview-body">
              {previewEvidence.previewable ? (
                <img
                  src={previewEvidence.url}
                  alt={previewEvidence.fileName}
                  className="evidences-preview-image"
                />
              ) : (
                <div className="evidences-preview-unavailable">
                  <strong>Visualização indisponível para este tipo de arquivo.</strong>
                  <span>
                    Você ainda pode baixar a evidência normalmente pelo botão
                    abaixo.
                  </span>
                </div>
              )}
            </div>

            <div className="evidences-preview-footer">
              <div className="evidences-preview-note">
                {previewEvidence.note || 'Sem observação informada.'}
              </div>

              <button
                type="button"
                className="evidences-download-button"
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

export default Evidences;