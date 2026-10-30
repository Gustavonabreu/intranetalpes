import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LEGACY_API_BASE_URL, SESSAO_EXPIRADA_EVENTO } from '../services/legacyApi';
import { SessaoAviso } from '../components/SessaoAviso';

// Quanto antes de expirar aparece o "Continuar conectado".
const AVISO_ANTES_DE_EXPIRAR_MS = 5 * 60 * 1000;

type SessaoStatus = 'ok' | 'expirando' | 'expirada';

type AuthUser = {
  id?: number | string;
  nome_completo?: string;
  imagem_url?: string;
  email?: string;
  role?: 'admin' | 'user';
  sessao_expira_em?: number;
};

type LoginResult = {
  ok: boolean;
  error?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  permissions: string[];
  canAccessRoute: (routePath: string) => boolean;
  loading: boolean;
  // true depois que a sessao expirou, ate o proximo login (o login mostra o motivo).
  sessaoExpirada: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getCookie(name: string) {
  if (!document.cookie) return null;
  const cookies = document.cookie.split(';');
  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();
    if (cookie.startsWith(`${name}=`)) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  return null;
}

async function primeCsrfToken() {
  try {
    await fetch(`${LEGACY_API_BASE_URL}/api/get-csrf-token/`, {
      credentials: 'include'
    });
  } catch {}
}

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessaoStatus, setSessaoStatus] = useState<SessaoStatus>('ok');
  const [renovando, setRenovando] = useState(false);
  const [expiraEm, setExpiraEm] = useState<number | null>(null);

  // GET /auth/user tambem renova a sessao no backend (+8h) e devolve o novo sessao_expira_em.
  async function buscarUsuario() {
    const response = await fetch(`${LEGACY_API_BASE_URL}/api/auth/user/`, {
      credentials: 'include'
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthUser;
  }

  async function refreshUser() {
    try {
      const userData = await buscarUsuario();

      if (!userData) {
        setUser(null);
        setPermissions([]);
        return;
      }

      setUser(userData);
      setExpiraEm(userData.sessao_expira_em ?? null);
      setSessaoStatus('ok');

      const permissionResponse = await fetch(`${LEGACY_API_BASE_URL}/api/minhas-permissoes/`, {
        credentials: 'include'
      });

      if (permissionResponse.ok) {
        const permissionData = (await permissionResponse.json()) as {
          admin?: boolean;
          permissoes?: string[];
        };
        setPermissions(permissionData.permissoes || []);
      } else {
        setPermissions([]);
      }
    } catch {
      setUser(null);
      setPermissions([]);
    }
  }

  async function login(email: string, password: string): Promise<LoginResult> {
    await primeCsrfToken();
    const csrfToken = getCookie('csrftoken');

    try {
      const response = await fetch(`${LEGACY_API_BASE_URL}/api/auth/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {})
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        return {
          ok: false,
          error: data.error || 'Nao foi possivel entrar. Verifique suas credenciais.'
        };
      }

      await refreshUser();
      setSessaoStatus('ok');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Erro de conexao com o servidor.' };
    }
  }

  async function logout() {
    const csrfToken = getCookie('csrftoken');
    try {
      await fetch(`${LEGACY_API_BASE_URL}/api/auth/logout/`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRFToken': csrfToken } : undefined
      });
    } catch {
      // noop
    } finally {
      setUser(null);
      setPermissions([]);
      setSessaoStatus('ok');
    }
  }

  async function continuarConectado() {
    setRenovando(true);
    try {
      const userData = await buscarUsuario();
      if (userData) {
        setUser(userData);
        setExpiraEm(userData.sessao_expira_em ?? null);
        setSessaoStatus('ok');
      } else {
        setSessaoStatus('expirada');
      }
    } catch {
      // Sem rede: mantem o aviso para tentar de novo.
    } finally {
      setRenovando(false);
    }
  }

  // Limpa o usuario: o ProtectedRoute leva ao login com o motivo e volta para esta pagina depois.
  function entrarNovamente() {
    setUser(null);
    setPermissions([]);
  }

  const autenticado = Boolean(user);

  // Agenda o aviso (5 min antes) e a expiracao pelo horario que o backend informou.
  useEffect(() => {
    if (!autenticado || !expiraEm) return;
    let cancelado = false;

    function aplicar(fim: number) {
      const restante = fim - Date.now();
      setSessaoStatus((atual) => {
        if (atual === 'expirada' || restante <= 0) return 'expirada';
        return restante <= AVISO_ANTES_DE_EXPIRAR_MS ? 'expirando' : 'ok';
      });
    }

    // Confere no servidor antes de avisar: outra aba pode ter renovado a sessao (horario novo).
    async function conferir() {
      let fim = expiraEm!;
      try {
        const response = await fetch(`${LEGACY_API_BASE_URL}/api/auth/sessao/`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = (await response.json()) as { sessao_expira_em?: number };
          fim = Number(data.sessao_expira_em) || fim;
        } else if (response.status === 403) {
          fim = 0;
        }
      } catch {
        // Sem rede: decide pelo horario local.
      }
      if (cancelado) return;
      if (fim > expiraEm!) {
        setExpiraEm(fim); // reagenda com o horario renovado
        return;
      }
      aplicar(fim);
    }

    aplicar(expiraEm);
    const restante = expiraEm - Date.now();
    const timers = [
      window.setTimeout(conferir, Math.max(0, restante - AVISO_ANTES_DE_EXPIRAR_MS)),
      window.setTimeout(conferir, Math.max(0, restante))
    ];
    // Timers atrasam com a aba em segundo plano ou o PC suspenso: confere ao voltar.
    function aoVoltar() {
      if (document.visibilityState === 'visible' && Date.now() >= expiraEm! - AVISO_ANTES_DE_EXPIRAR_MS) {
        conferir();
      }
    }
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      cancelado = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [autenticado, expiraEm]);

  // Qualquer chamada da API recusada por sessao expirada (ex.: servidor reiniciado, logout em outra aba).
  useEffect(() => {
    if (!autenticado) return;
    function aoExpirar() {
      setSessaoStatus('expirada');
    }
    window.addEventListener(SESSAO_EXPIRADA_EVENTO, aoExpirar);
    return () => window.removeEventListener(SESSAO_EXPIRADA_EVENTO, aoExpirar);
  }, [autenticado]);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      setLoading(true);
      await refreshUser();
      if (mounted) setLoading(false);
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isAdmin = user?.role === 'admin';

    return {
      user,
      isAuthenticated: Boolean(user),
      isAdmin,
      permissions,
      canAccessRoute: (routePath: string) => {
        if (!user) return false;
        if (isAdmin) return true;
        const normalized = routePath.split('?')[0];
        return permissions.some(
          (allowedRoute) =>
            normalized === allowedRoute || normalized.startsWith(`${allowedRoute}/`)
        );
      },
      loading,
      sessaoExpirada: sessaoStatus === 'expirada',
      refreshUser,
      login,
      logout
    };
  }, [user, permissions, loading, sessaoStatus]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {user ? (
        <SessaoAviso
          status={sessaoStatus}
          expiraEm={expiraEm}
          renovando={renovando}
          onContinuar={continuarConectado}
          onEntrarNovamente={entrarNovamente}
        />
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
