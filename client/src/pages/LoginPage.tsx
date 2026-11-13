import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import logoAlpes from '../assets/brand/logo_grupo_preto.png';
import { EnfeiteFundo, EnfeiteLoginSaudacao } from '../temas/TemaFestivo';
import { LEGACY_API_BASE_URL } from '../services/legacyApi';

const GOOGLE_ERROS: Record<string, string> = {
  nao_cadastrado:
    'Essa conta Google nao e o e-mail corporativo de um funcionario ativo. Entre com usuario e senha ou fale com o RH.',
  inativo: 'Seu usuario esta inativo na intranet.',
  cancelado: 'Login com Google cancelado.',
  expirado: 'O login com Google demorou demais. Tente de novo.',
  email_nao_verificado: 'O e-mail dessa conta Google nao esta verificado.',
  nao_configurado: 'O login com Google ainda nao esta configurado no servidor.',
  falha: 'Nao foi possivel entrar com Google. Tente de novo.'
};

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
    // A tela de login e sempre no tema claro, independente da preferencia salva.
    document.body.classList.remove('dark-mode');
    return () => {
      document.body.classList.remove('login-page');
      // Ao sair do login, restaura o tema salvo pelo usuario.
      if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
      }
    };
  }, []);

  // Retorno do login com Google (o backend volta para /login?google_erro=... quando nao da certo).
  const googleErro = useMemo(() => new URLSearchParams(location.search).get('google_erro'), [location.search]);

  const nextSeguro = useMemo(() => {
    const next = new URLSearchParams(location.search).get('next');
    return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  }, [location.search]);

  const googleLoginUrl = `${LEGACY_API_BASE_URL}/api/auth/google/login?next=${encodeURIComponent(nextSeguro)}`;

  useEffect(() => {
    if (googleErro) {
      setError(GOOGLE_ERROS[googleErro] || GOOGLE_ERROS.falha);
      return;
    }

    if (sessionReason === 'session_expired') {
      setError('Sua sessao expirou. Por favor, faca o login novamente.');
      return;
    }

    if (sessionReason === 'network_error') {
      setError('Erro de conexao. Verifique sua rede e tente novamente.');
      return;
    }

    setError('');
  }, [sessionReason, googleErro]);

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

    navigate(nextSeguro, { replace: true });
    setLoading(false);
  }

  return (
    <main className="login-page-shell">
      <EnfeiteFundo topo={0} />
      <div className="login-container">
        <EnfeiteLoginSaudacao />
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

        <div className="login-divisor" aria-hidden="true">
          <span>ou</span>
        </div>

        {/* Navegacao normal (nao fetch): o backend redireciona para o Google e de volta para ca. */}
        <a className="login-google" href={googleLoginUrl}>
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Entrar com Google
        </a>
        <small className="login-google-dica">Use a conta Google do seu e-mail corporativo.</small>
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
