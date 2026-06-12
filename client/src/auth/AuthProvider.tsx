import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LEGACY_API_BASE_URL } from '../services/legacyApi';

type AuthUser = {
  id?: number | string;
  nome_completo?: string;
  imagem_url?: string;
  email?: string;
};

type LoginResult = {
  ok: boolean;
  error?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
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
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    try {
      const response = await fetch(`${LEGACY_API_BASE_URL}/api/auth/user/`, {
        credentials: 'include'
      });

      if (!response.ok) {
        setUser(null);
        return;
      }

      const userData = (await response.json()) as AuthUser;
      setUser(userData);
    } catch {
      setUser(null);
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
    }
  }

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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      loading,
      refreshUser,
      login,
      logout
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
