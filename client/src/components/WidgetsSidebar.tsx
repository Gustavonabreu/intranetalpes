import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { legacyGetJson } from '../services/legacyApi';
import { handlePhotoFallback } from '../services/photoFallback';

type PostRecente = {
  id?: number;
  titulo?: string;
  data_publicacao?: string;
};

type EnqueteOpcao = {
  id?: number;
  texto_opcao?: string;
  votos?: number;
};

type EnqueteAtiva = {
  id?: number;
  pergunta?: string;
  opcoes?: EnqueteOpcao[];
};

type MembroEquipe = {
  id?: number;
  nome_formatado?: string;
  aniversario?: string | null;
  imagem_url?: string;
};

type EventoEmpresa = {
  id?: number;
  titulo?: string;
  descricao?: string;
  data_evento?: string;
  ativo?: number;
};

type UpcomingEvent = {
  id: string;
  title: string;
  date: Date;
  timeLabel: string;
};

function getDisplayName(fullName?: string) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'Colaborador';
  if (parts.length === 1) return parts[0];
  
  // Pega no primeiro e no ÚLTIMO nome do array
  const primeiroNome = parts[0];
  const ultimoNome = parts[parts.length - 1];

  return `${primeiroNome} ${ultimoNome}`;
}

function getBirthMonth(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();

  // Avoid timezone shifts for MySQL DATE strings (YYYY-MM-DD).
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const month = Number(match[2]);
    return Number.isFinite(month) ? month : null;
  }

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.getMonth() + 1;
}

function getBirthDay(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const day = Number(match[3]);
    return Number.isFinite(day) ? day : null;
  }
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.getDate();
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatTimeLabel(date: Date) {
  if (date.getHours() === 0 && date.getMinutes() === 0) return 'Dia inteiro';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type WidgetsSidebarProps = {
  autoCollapse?: boolean;
};

export function WidgetsSidebar({ autoCollapse = false }: WidgetsSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [posts, setPosts] = useState<PostRecente[]>([]);
  const [enquete, setEnquete] = useState<EnqueteAtiva | null>(null);
  const [aniversariantes, setAniversariantes] = useState<MembroEquipe[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);

  useEffect(() => {
    if (autoCollapse) {
      setCollapsed(true);
    }
  }, [autoCollapse]);

  useEffect(() => {
    let mounted = true;

    async function loadWidgets() {
      let companyUpcoming: UpcomingEvent[] = [];

      try {
        const data = await legacyGetJson<PostRecente[]>('/api/noticias-recentes/');
        if (mounted) setPosts(data || []);
      } catch {
        if (mounted) setPosts([]);
      }

      try {
        const data = await legacyGetJson<EnqueteAtiva>('/api/enquete-ativa/');
        if (mounted) setEnquete(data?.id ? data : null);
      } catch {
        if (mounted) setEnquete(null);
      }

      try {
        const data = await legacyGetJson<EventoEmpresa[]>('/api/eventos-empresa/');
        const now = new Date();
        const limitDate = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 90);

        companyUpcoming = (data || [])
          .map((event, index) => {
            const rawDate = String(event.data_evento || '').trim();
            const date = rawDate ? new Date(rawDate) : null;
            if (!date || !Number.isFinite(date.getTime())) return null;
            return {
              id: `empresa-${event.id || index}`,
              title: event.titulo || 'Evento da empresa',
              date,
              timeLabel: formatTimeLabel(date)
            };
          })
          .filter((item): item is UpcomingEvent => item !== null)
          .filter((item) => item.date >= now && item.date <= limitDate)
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .slice(0, 12);
      } catch {
        companyUpcoming = [];
      }

      try {
        const data = await legacyGetJson<MembroEquipe[]>('/api/equipe/');
        if (!mounted) return;

        const mesAtual = new Date().getMonth() + 1;
        const aniversariantesMes = (data || [])
          .filter((pessoa) => getBirthMonth(pessoa.aniversario) === mesAtual)
          .sort(
            (a, b) => (getBirthDay(a.aniversario) || 0) - (getBirthDay(b.aniversario) || 0)
          );

        setAniversariantes(aniversariantesMes);
      } catch {
        if (mounted) setAniversariantes([]);
      }

      if (mounted) {
        setUpcomingEvents(companyUpcoming);
      }
    }

    loadWidgets();
    return () => {
      mounted = false;
    };
  }, []);

  const totalVotos = useMemo(() => {
    if (!enquete?.opcoes?.length) return 0;
    return enquete.opcoes.reduce((acc, opcao) => acc + Number(opcao.votos || 0), 0);
  }, [enquete]);

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const eventDateSet = useMemo(() => {
    const set = new Set<string>();
    upcomingEvents.forEach((event) => set.add(toDateKey(event.date)));
    return set;
  }, [upcomingEvents]);

  const calendarCells = useMemo(() => {
    const cells: Array<{ key: string; day: number | null; hasEvent: boolean; isToday: boolean }> = [];
    const totalCells = 42;
    const todayKey = toDateKey(today);

    for (let index = 0; index < totalCells; index += 1) {
      const day = index - firstWeekday + 1;
      if (day < 1 || day > daysInMonth) {
        cells.push({ key: `empty-${index}`, day: null, hasEvent: false, isToday: false });
        continue;
      }

      const cellDate = new Date(today.getFullYear(), today.getMonth(), day);
      const cellKey = toDateKey(cellDate);
      cells.push({
        key: cellKey,
        day,
        hasEvent: eventDateSet.has(cellKey),
        isToday: cellKey === todayKey
      });
    }

    return cells;
  }, [daysInMonth, eventDateSet, firstWeekday, today]);

  const weekLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

  return (
    <aside className={`coluna-widgets${collapsed ? ' recolhida' : ''}`}>
      <button
        id="toggle-widgets-btn"
        title="Alternar barra lateral"
        type="button"
        onClick={() => setCollapsed((current) => !current)}
      >
        <i className={`fas ${collapsed ? 'fa-chevron-left' : 'fa-chevron-right'}`} />
      </button>

      <div className="widgets-content">
        <div className="widget">
          <h3>
            <Link
              to="/aniversariantes"
              className="no-underline text-inherit cursos-pointer hover:opacity-80 transition-opacity"
            >
              Aniversariantes do Mês
            </Link>
          </h3>
          {aniversariantes.length > 0 ? (
            <ul className="space-y-3 mt-3">
              {aniversariantes.map((item, index) => {
                const name = getDisplayName(item.nome_formatado);
                return (
                  <li key={item.id || `${name}-${index}`} className="flex items-center gap-3 py-1">
                    <img
                      src={item.imagem_url || 'https://dummyimage.com/40x40/cccccc/333333&text=U'}
                      alt={`Foto de ${name}`}
                      className="w-12 h-12 rounded-full object-cover border border-gray-600 flex-shrink-0"
                      onError={(event) =>
                        handlePhotoFallback(
                          event,
                          'https://dummyimage.com/40x40/cccccc/333333&text=U'
                        )
                      }
                    />
                    <span
                      className="text-sm font-medium truncate"
                      style={{ color: 'var(--cor-texto-principal)' }}
                    >
                      {name}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>Sem aniversariantes cadastrados para este mes.</p>
          )}
        </div>

        <div className="widget">
          <h3>Posts Recentes</h3>
          {posts.length > 0 ? (
            <ul className="space-y-2 mt-3">
              {posts.map((post) => (
                <li key={post.id || post.titulo} className="py-0.5">
                  <Link
                    to="/noticias"
                    className="text-black hover:text-gray-700 text-sm font-medium block truncate transition-colors"
                  >
                    {post.titulo || 'Post sem titulo'}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum post recente encontrado.</p>
          )}
        </div>

        <div className="widget">
          <h3 style={{ color: '#000000' }}>Proximos Eventos</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: '6px',
              marginTop: '10px'
            }}
          >
            {weekLabels.map((label) => (
              <div key={label} style={{ fontSize: '11px', textAlign: 'center', fontWeight: 700 }}>
                {label}
              </div>
            ))}
            {calendarCells.map((cell) => (
              <div
                key={cell.key}
                style={{
                  minHeight: '28px',
                  borderRadius: '6px',
                  border: cell.day ? '1px solid var(--cor-borda)' : '1px solid transparent',
                  background: cell.isToday
                    ? 'var(--cor-destaque)'
                    : cell.hasEvent
                      ? 'var(--cor-fundo-hover)'
                      : 'transparent',
                  color: cell.isToday ? 'var(--cor-texto-invertido)' : 'var(--cor-texto-principal)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: cell.hasEvent || cell.isToday ? 700 : 500
                }}
                title={cell.hasEvent ? 'Dia com evento' : ''}
              >
                {cell.day || ''}
              </div>
            ))}
          </div>

          {upcomingEvents.length > 0 ? (
            <ul className="space-y-2 widget-event-list">
              {upcomingEvents.slice(0, 4).map((event) => (
                <li key={event.id} className="widget-event-item">
                  <strong>{formatDateLabel(event.date)}</strong> {event.timeLabel} - {event.title}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ marginTop: '10px' }}>Nenhum evento previsto para os proximos dias.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
