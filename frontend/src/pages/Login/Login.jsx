import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoAgroTask from '../../assets/icons/LogoAgroTask.svg';
import api from '../../services/api';
import './Login.css';

const GOOGLE_SCRIPT_SELECTOR = 'script[src="https://accounts.google.com/gsi/client"]';

function Login() {
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);
  const googleInitializedRef = useRef(false);
  const googleRetryTimeoutRef = useRef(null);

  const [submittingLocalLogin, setSubmittingLocalLogin] = useState(false);
  const [submittingGoogleLogin, setSubmittingGoogleLogin] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [googleButtonStatus, setGoogleButtonStatus] = useState(() => {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID ? 'loading' : 'unavailable';
  });

  const isSubmitting = submittingLocalLogin || submittingGoogleLogin;

  const saveAuthData = (data) => {
    const { token, user, farm, membership } = data || {};

    if (!token || !user || !farm || !membership) {
      throw new Error('Resposta de autenticacao incompleta.');
    }

    localStorage.setItem('agrotask_token', token);
    localStorage.setItem('agrotask_user', JSON.stringify(user));
    localStorage.setItem('agrotask_farm', JSON.stringify(farm));
    localStorage.setItem('agrotask_membership', JSON.stringify(membership));
  };

  const clearGoogleRetryTimeout = () => {
    if (googleRetryTimeoutRef.current) {
      window.clearTimeout(googleRetryTimeoutRef.current);
      googleRetryTimeoutRef.current = null;
    }
  };

  const scheduleGoogleInitializationRetry = (initializeGoogleButton) => {
    clearGoogleRetryTimeout();
    googleRetryTimeoutRef.current = window.setTimeout(() => {
      initializeGoogleButton();
    }, 250);
  };

  const handleSuccessfulLogin = (data) => {
    saveAuthData(data);
    navigate('/dashboard', { replace: true });
  };

  const handleGoogleLogin = async (response) => {
    if (submittingGoogleLogin || submittingLocalLogin) {
      return;
    }

    try {
      setSubmittingGoogleLogin(true);
      setErrorMessage('');

      const apiResponse = await api.post('/auth/google/login', {
        credential: response.credential,
      });

      handleSuccessfulLogin(apiResponse.data);
    } catch (error) {
      const message =
        error.response?.data?.message ||
        'Nao foi possivel entrar com Google. Tente novamente.';

      setErrorMessage(message);
    } finally {
      setSubmittingGoogleLogin(false);
    }
  };

  useEffect(() => {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      setGoogleButtonStatus('unavailable');
      return undefined;
    }

    const initializeGoogleButton = () => {
      const googleAccounts = window.google?.accounts?.id;

      if (!googleButtonRef.current) {
        return;
      }

      if (!googleAccounts) {
        setGoogleButtonStatus('loading');
        scheduleGoogleInitializationRetry(initializeGoogleButton);
        return;
      }

      if (!googleInitializedRef.current) {
        googleAccounts.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: (response) => {
            handleGoogleLogin(response);
          },
        });
        googleInitializedRef.current = true;
      }

      googleButtonRef.current.innerHTML = '';

      googleAccounts.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: '452',
        text: 'signin_with',
        shape: 'pill',
      });

      setGoogleButtonStatus('ready');
      clearGoogleRetryTimeout();
    };

    const googleScript = document.querySelector(GOOGLE_SCRIPT_SELECTOR);
    const handleScriptLoad = () => {
      initializeGoogleButton();
    };

    initializeGoogleButton();

    googleScript?.addEventListener('load', handleScriptLoad);

    return () => {
      googleScript?.removeEventListener('load', handleScriptLoad);
      clearGoogleRetryTimeout();
    };
  }, []);

  const handleFieldInteraction = () => {
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submittingLocalLogin || submittingGoogleLogin) {
      return;
    }

    const submittedFormData = new FormData(event.currentTarget);
    const submittedEmail = String(
      submittedFormData.get('email') || ''
    ).trim();
    const submittedPassword = String(
      submittedFormData.get('senha') || ''
    );

    if (!submittedEmail || !submittedPassword) {
      setErrorMessage('Email e senha sao obrigatorios.');
      return;
    }

    try {
      setSubmittingLocalLogin(true);
      setErrorMessage('');

      const response = await api.post('/auth/login', {
        email: submittedEmail,
        senha: submittedPassword,
      });

      handleSuccessfulLogin(response.data);
    } catch (error) {
      const message =
        error.response?.data?.message ||
        'Nao foi possivel entrar. Verifique suas credenciais e tente novamente.';

      setErrorMessage(message);
    } finally {
      setSubmittingLocalLogin(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand">
          <div className="login-brand-icon">
            <img src={logoAgroTask} alt="Logo AgroTask" />
          </div>
          <span>AgroTask</span>
        </div>

        <div className="login-left-content">
          <h1>Organize melhor a rotina da sua fazenda.</h1>

          <p>
            Centralize tarefas, responsaveis, prazos, evidencias e historico em
            um unico ambiente, mantendo a operacao mais organizada no dia a dia.
          </p>

          <div className="login-highlight-card">
            <span className="login-highlight-label">No AgroTask voce acompanha</span>

            <div className="login-highlight-grid">
              <div className="login-highlight-item">
                <strong>Tarefas</strong>
                <span>Criacao, andamento e conclusao das atividades</span>
              </div>

              <div className="login-highlight-item">
                <strong>Responsaveis</strong>
                <span>Distribuicao clara do que cada pessoa deve executar</span>
              </div>

              <div className="login-highlight-item">
                <strong>Evidencias</strong>
                <span>Registro da execucao com mais rastreabilidade</span>
              </div>

              <div className="login-highlight-item">
                <strong>Dashboard</strong>
                <span>Visao rapida da operacao e do progresso da equipe</span>
              </div>
            </div>
          </div>
        </div>

        <div className="login-footer">
          © 2026 AgroTask. Todos os direitos reservados.
        </div>
      </div>

      <div className="login-right">
        <div className="login-form-wrapper">
          <div className="login-form-header">
            <h2>Bem-vindo de volta</h2>
            <p>Entre com suas credenciais para continuar</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="seu@email.com.br"
                autoComplete="email"
                required
                disabled={isSubmitting}
                onChange={handleFieldInteraction}
                onInput={handleFieldInteraction}
              />
            </div>

            <div className="form-group">
              <label htmlFor="senha">Senha</label>
              <input
                id="senha"
                name="senha"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={isSubmitting}
                onChange={handleFieldInteraction}
                onInput={handleFieldInteraction}
              />
            </div>

            {errorMessage && (
              <div className="login-error-message">{errorMessage}</div>
            )}

            <div className="login-forgot-password">
              <Link to="/forgot-password">Esqueceu a senha?</Link>
            </div>

            <button
              type="submit"
              className="login-submit-button"
              disabled={isSubmitting}
            >
              {submittingLocalLogin ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="login-google-divider">
            <span>ou</span>
          </div>

          <div className="login-google-wrapper">
            <div
              ref={googleButtonRef}
              className={`login-google-slot ${
                googleButtonStatus === 'ready' ? 'is-ready' : ''
              }`}
            />

            {googleButtonStatus === 'loading' && (
              <div className="login-google-loading">
                Carregando acesso com Google...
              </div>
            )}

            {googleButtonStatus === 'unavailable' && (
              <div className="login-google-unavailable">
                Login com Google indisponivel nesta configuracao.
              </div>
            )}
          </div>

          <div className="login-divider" />

          <p className="login-register-link">
            Nao tem uma conta? <Link to="/register">Criar conta</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
