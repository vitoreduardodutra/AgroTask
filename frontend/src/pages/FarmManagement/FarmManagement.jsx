import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import AppShell from '../../components/AppShell/AppShell';
import './FarmManagement.css';

function FarmManagement() {
  const [farm, setFarm] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copyMessage, setCopyMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const storedUser = useMemo(() => {
    return JSON.parse(localStorage.getItem('agrotask_user') || 'null');
  }, []);

  const activeMembers = members.filter((member) => member.status === 'ACTIVE').length;
  const inactiveMembers = members.filter((member) => member.status === 'INACTIVE').length;

  const loadFarmData = async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      const response = await api.get('/farms/current');

      setFarm(response.data.farm);
      setMembers(response.data.members || []);
    } catch (error) {
      const message =
        error.response?.data?.message ||
        'Não foi possível carregar os dados da fazenda no momento.';

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFarmData();
  }, []);

  useEffect(() => {
    if (!copyMessage) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setCopyMessage('');
    }, 2200);

    return () => clearTimeout(timeout);
  }, [copyMessage]);

  const handleCopyInviteCode = async () => {
    if (!farm?.inviteCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(farm.inviteCode);
      setCopyMessage('Código copiado com sucesso.');
    } catch (error) {
      setCopyMessage('Não foi possível copiar o código.');
    }
  };

  const handleToggleMemberStatus = async (member) => {
    const nextStatus = member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    try {
      setActionLoadingId(member.id);
      setErrorMessage('');

      await api.patch(`/farms/members/${member.id}/status`, {
        status: nextStatus,
      });

      await loadFarmData();
    } catch (error) {
      const message =
        error.response?.data?.message ||
        'Não foi possível atualizar o status do membro.';

      setErrorMessage(message);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <AppShell title="Minha Fazenda" pageClassName="farm-page">
      <div className="farm-shell">
        <div className="farm-container">

          <div className="farm-page-header">
            <h2>Minha fazenda</h2>
            <p>Dados gerais da fazenda e gestão de membros</p>
          </div>

          {loading ? (
            <div className="farm-feedback info">Carregando dados da fazenda...</div>
          ) : (
            <>
              {errorMessage && (
                <div className="farm-feedback error">{errorMessage}</div>
              )}

              {farm && (
                <>
                  <section className="farm-summary-grid">
                    <article className="farm-summary-card">
                      <span className="farm-summary-label">Nome da fazenda</span>
                      <strong>{farm.name}</strong>
                    </article>

                    <article className="farm-summary-card">
                      <span className="farm-summary-label">Segmento</span>
                      <strong>{farm.segment}</strong>
                    </article>

                    <article className="farm-summary-card">
                      <span className="farm-summary-label">Membros ativos</span>
                      <strong>{activeMembers}</strong>
                    </article>

                    <article className="farm-summary-card">
                      <span className="farm-summary-label">Membros inativos</span>
                      <strong>{inactiveMembers}</strong>
                    </article>
                  </section>

                  <section className="farm-card">
                    <div className="farm-card-header">
                      <h3>Código da fazenda</h3>
                    </div>

                    <div className="farm-card-body">
                      <div className="farm-invite-row">
                        <div className="farm-invite-code">{farm.inviteCode}</div>

                        <button
                          type="button"
                          className="farm-copy-button"
                          onClick={handleCopyInviteCode}
                        >
                          Copiar código
                        </button>
                      </div>

                      <p className="farm-helper-text">
                        Compartilhe este código com funcionários para vinculá-los à
                        fazenda correta.
                      </p>

                      {copyMessage && (
                        <div className="farm-copy-message">{copyMessage}</div>
                      )}
                    </div>
                  </section>

                  <section className="farm-card">
                    <div className="farm-card-header">
                      <h3>Membros cadastrados</h3>
                    </div>

                    <div className="farm-card-body">
                      {members.length === 0 ? (
                        <div className="farm-empty-members">
                          Nenhum membro cadastrado ainda.
                        </div>
                      ) : (
                        <div className="farm-members-list">
                          {members.map((member) => {
                            const isOwnUser = storedUser?.id === member.user?.id;
                            const isLoading = actionLoadingId === member.id;

                            return (
                              <article key={member.id} className="farm-member-card">
                                <div className="farm-member-main">
                                  <div className="farm-member-avatar">
                                    {member.user?.name?.slice(0, 1)?.toUpperCase() || 'U'}
                                  </div>

                                  <div className="farm-member-info">
                                    <strong>{member.user?.name || 'Usuário'}</strong>
                                    <span>{member.user?.email || 'Sem e-mail'}</span>

                                    <div className="farm-member-tags">
                                      <span className="farm-tag farm-tag-role">
                                        {member.role === 'ADMIN'
                                          ? 'Administrador'
                                          : 'Funcionário'}
                                      </span>

                                      <span
                                        className={`farm-tag ${
                                          member.status === 'ACTIVE'
                                            ? 'farm-tag-active'
                                            : 'farm-tag-inactive'
                                        }`}
                                      >
                                        {member.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                                      </span>

                                      {isOwnUser && (
                                        <span className="farm-tag farm-tag-own">
                                          Você
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  className={`farm-member-action ${
                                    member.status === 'ACTIVE'
                                      ? 'farm-member-action-danger'
                                      : 'farm-member-action-success'
                                  }`}
                                  onClick={() => handleToggleMemberStatus(member)}
                                  disabled={isLoading}
                                >
                                  {isLoading
                                    ? 'Salvando...'
                                    : member.status === 'ACTIVE'
                                    ? 'Inativar'
                                    : 'Ativar'}
                                </button>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default FarmManagement;