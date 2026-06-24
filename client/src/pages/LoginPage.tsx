import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import logoAlpes from '../assets/brand/logo_grupo_preto.png';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const sessionReason = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('reason');
  }, [location.search]);

  useEffect(() => {
    document.body.classList.add('login-page');
    return () => {
      document.body.classList.remove('login-page');
    };
  }, []);

  useEffect(() => {
    if (sessionReason === 'session_expired') {
      setError('Sua sessao expirou. Por favor, faca o login novamente.');
      return;
    }

    if (sessionReason === 'network_error') {
      setError('Erro de conexao. Verifique sua rede e tente novamente.');
      return;
    }

    setError('');
  }, [sessionReason]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(email, password);
    if (!result.ok) {
      setError(result.error || 'Nao foi possivel entrar. Verifique suas credenciais.');
      setLoading(false);
      return;
    }

    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    const safeNext = next && next.startsWith('/') ? next : '/dashboard';
    navigate(safeNext, { replace: true });
    setLoading(false);
  }

  return (
    <main className="login-page-shell">
      <div className="login-container">
        <h2>Acesse a Intranet</h2>

        <form id="login-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="email">Usuario</label>
            <input
              type="text"
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <p id="login-error" className="error-message">
            {error}
          </p>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>

      <div className="imagem-container">
        <img
          src={logoAlpes}
          alt="Logo Grupo Alpes"
        />
      </div>
    </main>
  );
}
