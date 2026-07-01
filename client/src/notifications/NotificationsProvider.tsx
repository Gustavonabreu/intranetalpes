import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useAuth } from '../auth/AuthProvider';
import { legacyGetJson } from '../services/legacyApi';

// Marcadores de versao de conteudo das paginas estaticas.
// Ao alterar o conteudo de "Sobre a Empresa" ou "Fala Alpes",
// basta trocar a data abaixo para que todos os usuarios recebam
// novamente o indicador de "pendente" na sidebar.
export const SECTION_VERSIONS = {
  empresa: '2025-07-01',
  falaAlpes: '2025-07-01'
} as const;

export type NoticiaNotif = {
  id: number;
  titulo: string;
  data_publicacao?: string | null;
};

type SeenSections = { empresa?: string; falaAlpes?: string };

type NotificationsContextValue = {
  noticias: NoticiaNotif[];
  unreadCount: number;
  loading: boolean;
  isRead: (id: number) => boolean;
  markAsRead: (id: number) => void;
  markAllAsRead: () => void;
  pending: { noticias: boolean; empresa: boolean; falaAlpes: boolean };
  markSectionSeen: (section: 'empresa' | 'falaAlpes') => void;
  reload: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const readKey = (userId: string) => `alpes:notif:read:${userId}`;
const seenKey = (userId: string) => `alpes:notif:seen:${userId}`;

function loadReadIds(userId: string): Set<number> {
  try {
    const raw = localStorage.getItem(readKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(Array.isArray(arr) ? arr.map(Number) : []);
  } catch {
    return new Set();
  }
}

function loadSeen(userId: string): SeenSections {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenSections;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = String(user?.id ?? 'anon');

  const [noticias, setNoticias] = useState<NoticiaNotif[]>([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<number>>(() => loadReadIds(userId));
  const [seen, setSeen] = useState<SeenSections>(() => loadSeen(userId));

  // Recarrega o estado local (lidos / secoes vistas) quando o usuario muda.
  useEffect(() => {
    setReadIds(loadReadIds(userId));
    setSeen(loadSeen(userId));
  }, [userId]);

  const reload = useCallback(async () => {
    try {
      const data = await legacyGetJson<NoticiaNotif[]>('/api/noticias/');
      setNoticias(
        (data || [])
          .filter((n) => n && n.id != null)
          .map((n) => ({
            id: Number(n.id),
            titulo: n.titulo || 'Noticia sem titulo',
            data_publicacao: n.data_publicacao ?? null
          }))
      );
    } catch {
      setNoticias([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const timer = window.setInterval(() => {
      reload();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const markAsRead = useCallback(
    (id: number) => {
      setReadIds((current) => {
        if (current.has(id)) return current;
        const next = new Set(current);
        next.add(id);
        try {
          localStorage.setItem(readKey(userId), JSON.stringify(Array.from(next)));
        } catch {
          // noop
        }
        return next;
      });
    },
    [userId]
  );

  const markAllAsRead = useCallback(() => {
    setReadIds(() => {
      const next = new Set(noticias.map((n) => n.id));
      try {
        localStorage.setItem(readKey(userId), JSON.stringify(Array.from(next)));
      } catch {
        // noop
      }
      return next;
    });
  }, [noticias, userId]);

  const markSectionSeen = useCallback(
    (section: 'empresa' | 'falaAlpes') => {
      setSeen((current) => {
        if (current[section] === SECTION_VERSIONS[section]) return current;
        const next = { ...current, [section]: SECTION_VERSIONS[section] };
        try {
          localStorage.setItem(seenKey(userId), JSON.stringify(next));
        } catch {
          // noop
        }
        return next;
      });
    },
    [userId]
  );

  const isRead = useCallback((id: number) => readIds.has(id), [readIds]);

  const unreadCount = useMemo(
    () => noticias.reduce((acc, n) => (readIds.has(n.id) ? acc : acc + 1), 0),
    [noticias, readIds]
  );

  const pending = useMemo(
    () => ({
      noticias: unreadCount > 0,
      empresa: seen.empresa !== SECTION_VERSIONS.empresa,
      falaAlpes: seen.falaAlpes !== SECTION_VERSIONS.falaAlpes
    }),
    [unreadCount, seen]
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      noticias,
      unreadCount,
      loading,
      isRead,
      markAsRead,
      markAllAsRead,
      pending,
      markSectionSeen,
      reload
    }),
    [noticias, unreadCount, loading, isRead, markAsRead, markAllAsRead, pending, markSectionSeen, reload]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return ctx;
}
