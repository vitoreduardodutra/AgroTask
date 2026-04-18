import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import backIcon from '../../assets/icons/Voltar.svg';
import createTaskIcon from '../../assets/icons/CriarTarefa.svg';
import AppShell from '../../components/AppShell/AppShell';
import './NewTask.css';

function NewTask() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [savingTask, setSavingTask] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    area: '',
    responsibleId: '',
    deadline: '',
    priority: 'MEDIUM',
    status: 'PENDING',
    completionRequiresApproval: false,
    requirePhotoEvidence: false,
    requireNoteEvidence: false,
    requireLocationEvidence: false,
  });

  const handleLogout = () => {
    localStorage.removeItem('agrotask_token');
    localStorage.removeItem('agrotask_user');
    localStorage.removeItem('agrotask_farm');
    localStorage.removeItem('agrotask_membership');
    navigate('/', { replace: true });
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  useEffect(() => {
    async function loadFormOptions() {
      try {
        setLoadingOptions(true);
        setErrorMessage('');

        const response = await api.get('/tasks/form-options');

        const usersList = response.data.users || [];
        setUsers(usersList);

        if (usersList.length > 0) {
          setFormData((prev) => ({
            ...prev,
            responsibleId: prev.responsibleId || String(usersList[0].id),
          }));
        }
      } catch (error) {
        const status = error.response?.status;
        const message =
          error.response?.data?.message ||
          'Não foi possível carregar os dados do formulário.';

        if (status === 401 || status === 403) {
          handleLogout();
          return;
        }

        setErrorMessage(message);
      } finally {
        setLoadingOptions(false);
      }
    }

    loadFormOptions();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSavingTask(true);
      setErrorMessage('');
      setSuccessMessage('');

      const response = await api.post('/tasks', {
        title: formData.title,
        description: formData.description,
        area: formData.area,
        responsibleId: Number(formData.responsibleId),
        deadline: formData.deadline,
        priority: formData.priority,
        status: formData.status,
        completionRequiresApproval: formData.completionRequiresApproval,
        requirePhotoEvidence: formData.requirePhotoEvidence,
        requireNoteEvidence: formData.requireNoteEvidence,
        requireLocationEvidence: formData.requireLocationEvidence,
      });

      setSuccessMessage(response.data.message || 'Tarefa criada com sucesso.');

      setTimeout(() => {
        navigate('/tasks', { replace: true });
      }, 900);
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message || 'Não foi possível criar a tarefa.';

      if (status === 401 || status === 403) {
        handleLogout();
        return;
      }

      setErrorMessage(message);
    } finally {
      setSavingTask(false);
    }
  };

  return (
    <AppShell title="Nova Tarefa" pageClassName="new-task-page">
      <div className="new-task-shell">
        <div className="new-task-container">
          <Link to="/tasks" className="new-task-back-link">
            <img src={backIcon} alt="" className="new-task-back-icon" />
            <span>Voltar</span>
          </Link>

          <div className="new-task-page-header">
            <h2>Nova tarefa</h2>
            <p>Preencha os campos para criar uma nova tarefa operacional</p>
          </div>

          {errorMessage && (
            <div className="new-task-feedback error">{errorMessage}</div>
          )}

          {successMessage && (
            <div className="new-task-feedback success">{successMessage}</div>
          )}

          <form onSubmit={handleSubmit}>
            <section className="new-task-card">
              <div className="new-task-card-header">
                <h3>IDENTIFICAÇÃO</h3>
              </div>

              <div className="new-task-card-body">
                <div className="new-task-field">
                  <label htmlFor="titulo">
                    Título <span>*</span>
                  </label>
                  <input
                    id="titulo"
                    type="text"
                    placeholder="Ex: Aplicação de defensivo – Talhão 4"
                    value={formData.title}
                    onChange={(event) => handleChange('title', event.target.value)}
                    required
                  />
                </div>

                <div className="new-task-field">
                  <label htmlFor="descricao">
                    Descrição <span>*</span>
                  </label>
                  <textarea
                    id="descricao"
                    rows="6"
                    placeholder="Descreva detalhadamente o que deve ser feito, incluindo procedimentos e observações relevantes"
                    value={formData.description}
                    onChange={(event) =>
                      handleChange('description', event.target.value)
                    }
                    required
                  />
                </div>

                <div className="new-task-field">
                  <label htmlFor="area">Área / Local</label>
                  <input
                    id="area"
                    type="text"
                    placeholder="Ex: Talhão 4"
                    value={formData.area}
                    onChange={(event) => handleChange('area', event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="new-task-card">
              <div className="new-task-card-header">
                <h3>RESPONSABILIDADE E PRAZO</h3>
              </div>

              <div className="new-task-card-body new-task-two-columns">
                <div className="new-task-field">
                  <label htmlFor="responsavel">
                    Responsável <span>*</span>
                  </label>
                  <select
                    id="responsavel"
                    value={formData.responsibleId}
                    onChange={(event) =>
                      handleChange('responsibleId', event.target.value)
                    }
                    disabled={loadingOptions || users.length === 0}
                    required
                  >
                    {loadingOptions && <option value="">Carregando...</option>}

                    {!loadingOptions && users.length === 0 && (
                      <option value="">Nenhum usuário ativo encontrado</option>
                    )}

                    {!loadingOptions &&
                      users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="new-task-field">
                  <label htmlFor="prazo">
                    Prazo <span>*</span>
                  </label>
                  <input
                    id="prazo"
                    type="datetime-local"
                    value={formData.deadline}
                    onChange={(event) => handleChange('deadline', event.target.value)}
                    required
                  />
                </div>
              </div>
            </section>

            <section className="new-task-card">
              <div className="new-task-card-header">
                <h3>CLASSIFICAÇÃO</h3>
              </div>

              <div className="new-task-card-body">
                <div className="new-task-classification-grid">
                  <div className="new-task-priority-block">
                    <label className="new-task-section-label">Prioridade</label>

                    <div className="new-task-priority-options">
                      <button
                        type="button"
                        className={`priority-option ${
                          formData.priority === 'LOW' ? 'active low' : ''
                        }`}
                        onClick={() => handleChange('priority', 'LOW')}
                      >
                        Baixa
                      </button>

                      <button
                        type="button"
                        className={`priority-option ${
                          formData.priority === 'MEDIUM' ? 'active medium' : ''
                        }`}
                        onClick={() => handleChange('priority', 'MEDIUM')}
                      >
                        Média
                      </button>

                      <button
                        type="button"
                        className={`priority-option ${
                          formData.priority === 'HIGH' ? 'active high' : ''
                        }`}
                        onClick={() => handleChange('priority', 'HIGH')}
                      >
                        Alta
                      </button>
                    </div>
                  </div>

                  <div className="new-task-status-block">
                    <label className="new-task-section-label">Status</label>

                    <div className="new-task-status-options">
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
                          formData.status === 'IN_PROGRESS' ? 'active' : ''
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

            <section className="new-task-card">
              <div className="new-task-card-header">
                <h3>VALIDAÇÃO DA CONCLUSÃO</h3>
              </div>

              <div className="new-task-card-body">
                <div className="new-task-field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={formData.completionRequiresApproval}
                      onChange={(event) =>
                        handleChange('completionRequiresApproval', event.target.checked)
                      }
                      style={{ width: 18, height: 18 }}
                    />
                    <span>Exigir aprovação do administrador quando a tarefa for concluída</span>
                  </label>
                </div>

                <div className="new-task-field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={formData.requirePhotoEvidence}
                      onChange={(event) =>
                        handleChange('requirePhotoEvidence', event.target.checked)
                      }
                      style={{ width: 18, height: 18 }}
                    />
                    <span>Exigir pelo menos uma evidência com foto</span>
                  </label>
                </div>

                <div className="new-task-field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={formData.requireNoteEvidence}
                      onChange={(event) =>
                        handleChange('requireNoteEvidence', event.target.checked)
                      }
                      style={{ width: 18, height: 18 }}
                    />
                    <span>Exigir pelo menos uma evidência com observação</span>
                  </label>
                </div>

                <div className="new-task-field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={formData.requireLocationEvidence}
                      onChange={(event) =>
                        handleChange('requireLocationEvidence', event.target.checked)
                      }
                      style={{ width: 18, height: 18 }}
                    />
                    <span>Exigir pelo menos uma evidência com localização</span>
                  </label>
                </div>

                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 16,
                    background: '#f8fafc',
                    border: '1px solid #e5e7eb',
                    color: '#667085',
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  Essas regras serão verificadas antes da conclusão da tarefa.
                </div>
              </div>
            </section>

            <div className="new-task-actions">
              <button
                type="submit"
                className="new-task-save-button"
                disabled={savingTask || loadingOptions}
              >
                <img
                  src={createTaskIcon}
                  alt=""
                  className="new-task-save-icon"
                />
                <span>{savingTask ? 'Criando...' : 'Criar tarefa'}</span>
              </button>

              <Link to="/tasks" className="new-task-cancel-button">
                Cancelar
              </Link>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}

export default NewTask;