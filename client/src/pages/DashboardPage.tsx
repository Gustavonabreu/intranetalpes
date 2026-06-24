import { useEffect, useMemo, useState } from 'react';
import clientesMapImage from '../assets/brand/clientes-map.png';
import defaultHeroImage from '../assets/brand/inicio_padrao.webp';
import { LEGACY_API_BASE_URL, LegacyApiError, legacyGetJson } from '../services/legacyApi';

type CalendarEvent = {
  summary?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
};

type Aviso = {
  id?: number;
  titulo?: string;
  imagem_url?: string;
  link?: string;
};

type Noticia = {
  id?: number;
  titulo?: string;
  imagem_destaque_url?: string | null;
};

type IntranetConfig = {
  imagem_inicial_url?: string | null;
};

type Project = {
  id: number;
  titulo: string;
  resumo?: string | null;
  descricao?: string | null;
  descricao_detalhada?: string | null;
  imagem_url?: string | null;
  link_url?: string | null;
  tipo?: 'cliente' | 'projeto';
  progresso?: number;
  ativo?: number;
  ordem?: number;
};

type ParsedCalendarEvent = {
  id: string;
  title: string;
  date: Date;
  dateKey: string;
  timeLabel: string;
};

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseCalendarEvent(event: CalendarEvent, index: number): ParsedCalendarEvent | null {
  const rawStart = event.start?.dateTime || event.start?.date;
  if (!rawStart) return null;
  const date = new Date(rawStart);
  if (!Number.isFinite(date.getTime())) return null;

  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  const timeLabel = isAllDay
    ? 'Dia inteiro'
    : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return {
    id: `${event.summary || 'evento'}-${index}-${rawStart}`,
    title: event.summary?.trim() || 'Evento sem titulo',
    date,
    dateKey: toDateKey(date),
    timeLabel
  };
}

export function DashboardPage() {
  const [userName, setUserName] = useState('Usuario');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarNeedsConnect, setCalendarNeedsConnect] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [currentAvisoIndex, setCurrentAvisoIndex] = useState(0);
  const [heroImage, setHeroImage] = useState(defaultHeroImage);

  function resolveMediaUrl(url: string) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
    if (url.startsWith('/')) return `${LEGACY_API_BASE_URL}${url}`;
    return `${LEGACY_API_BASE_URL}/${url}`;
  }

  useEffect(() => {
    let mounted = true;
    const calendarStatus = new URLSearchParams(window.location.search).get('calendar');
    if (calendarStatus === 'connected') {
      setCalendarMessage('Calendario conectado com sucesso.');
    } else if (calendarStatus === 'error') {
      setCalendarMessage('Nao foi possivel conectar ao Google Calendar.');
    }

    async function loadDashboardData() {
      try {
        const user = await legacyGetJson<{ nome_completo?: string }>('/api/auth/user/');
        if (mounted && user.nome_completo) {
          setUserName(user.nome_completo.split(' ')[0] || 'Usuario');
        }
      } catch {}

      try {
        const eventsData = await legacyGetJson<CalendarEvent[]>(
          `/api/calendar/events/?t=${Date.now()}`
        );
        if (mounted) {
          setEvents(eventsData || []);
          setCalendarNeedsConnect(false);
        }
      } catch (error) {
        if (!mounted) return;
        setEvents([]);
        if (error instanceof LegacyApiError) {
          const msg = (error.message || '').toLowerCase();
          const needsConnect = error.status === 403 && msg.includes('google calendar');
          setCalendarNeedsConnect(needsConnect);
          if (error.status === 503) {
            setCalendarMessage('Google Calendar nao configurado no backend.');
          } else if (needsConnect && !calendarStatus) {
            setCalendarMessage('Conecte sua conta Google para carregar seus eventos.');
          }
        }
      }

      try {
        const projectsData = await legacyGetJson<Project[]>('/api/projetos/');
        if (mounted) setProjects(projectsData || []);
      } catch {
        if (mounted) setProjects([]);
      }

      try {
        const noticiasData = await legacyGetJson<Noticia[]>('/api/noticias/');
        if (mounted) {
          const mappedAvisos = (noticiasData || []).slice(0, 8).map((item) => ({
            id: item.id,
            titulo: item.titulo || 'Noticia',
            imagem_url:
              resolveMediaUrl(item.imagem_destaque_url || '') ||
              'https://dummyimage.com/1200x400/0f172a/ffffff&text=Aviso+Intranet',
            link: '/noticias'
          }));
          setAvisos(mappedAvisos);
        }
      } catch {
        if (mounted) setAvisos([]);
      }

      try {
        const config = await legacyGetJson<IntranetConfig>('/api/intranet-config/');
        if (mounted && config?.imagem_inicial_url) {
          setHeroImage(resolveMediaUrl(config.imagem_inicial_url));
        }
      } catch {}
    }

    loadDashboardData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (avisos.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentAvisoIndex((prev) => (prev + 1) % avisos.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [avisos.length]);

  function goToPreviousAviso() {
    setCurrentAvisoIndex((prev) => {
      if (avisos.length <= 0) return 0;
      return (prev - 1 + avisos.length) % avisos.length;
    });
  }

  function goToNextAviso() {
    setCurrentAvisoIndex((prev) => {
      if (avisos.length <= 0) return 0;
      return (prev + 1) % avisos.length;
    });
  }

  const parsedEvents = useMemo(() => {
    return events
      .map((event, index) => parseCalendarEvent(event, index))
      .filter((item): item is ParsedCalendarEvent => item !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [events]);

  const nextEvents = useMemo(() => parsedEvents.slice(0, 4), [parsedEvents]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ParsedCalendarEvent[]>();
    for (const event of parsedEvents) {
      if (!map.has(event.dateKey)) map.set(event.dateKey, []);
      map.get(event.dateKey)!.push(event);
    }
    return map;
  }, [parsedEvents]);

  const monthLabel = useMemo(
    () =>
      currentMonth.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
      }),
    [currentMonth]
  );

  const calendarCells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = firstDay.getDay();
    const cells: Array<{ date: Date; inCurrentMonth: boolean }> = [];

    for (let i = 0; i < leading; i += 1) {
      const date = new Date(year, month, i - leading + 1);
      cells.push({ date, inCurrentMonth: false });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(year, month, day), inCurrentMonth: true });
    }

    while (cells.length % 7 !== 0) {
      const date = new Date(year, month, daysInMonth + (cells.length % 7) + 1);
      cells.push({ date, inCurrentMonth: false });
    }

    return cells;
  }, [currentMonth]);

  const todayKey = toDateKey(new Date());

  return (
    <>
      <div className="telainicio" style={{ backgroundImage: `url('${heroImage}')` }}></div>

      <div className="welcome-message">
        <h3>
          Bem-vindo de volta, <span id="welcome-message">{userName}</span>!
        </h3>
        <hr />
      </div>

      <div className="agenda-container">
        <div className="calendario-principal">
          <div className="calendar-header">
            <h3>Calendario</h3>
            {!calendarNeedsConnect && (
              <div className="calendar-month-nav">
                <button
                  type="button"
                  className="calendar-nav-btn"
                  onClick={() =>
                    setCurrentMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                    )
                  }
                >
                  {'<'}
                </button>
                <span className="calendar-month-label">{monthLabel}</span>
                <button
                  type="button"
                  className="calendar-nav-btn"
                  onClick={() =>
                    setCurrentMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                    )
                  }
                >
                  {'>'}
                </button>
              </div>
            )}
          </div>
          <div id="meu-calendario-container">
            {calendarNeedsConnect ? (
              <div className="conectar-calendario">
                <p>{calendarMessage || 'Conecte sua conta Google para ver seus eventos.'}</p>
                <button
                  id="btn-conectar-google"
                  type="button"
                  onClick={() => {
                    window.location.href = `${LEGACY_API_BASE_URL}/api/calendar/connect/`;
                  }}
                >
                  Conectar com Google
                </button>
              </div>
            ) : parsedEvents.length > 0 ? (
              <div className="calendar-grid-wrap">
                <div className="calendar-weekdays">
                  <span>Dom</span>
                  <span>Seg</span>
                  <span>Ter</span>
                  <span>Qua</span>
                  <span>Qui</span>
                  <span>Sex</span>
                  <span>Sab</span>
                </div>
                <div className="calendar-grid">
                  {calendarCells.map((cell) => {
                    const key = toDateKey(cell.date);
                    const dayEvents = eventsByDate.get(key) || [];
                    const visibleEvents = dayEvents.slice(0, 2);
                    const isToday = key === todayKey;

                    return (
                      <div
                        key={`${key}-${cell.inCurrentMonth ? 'in' : 'out'}`}
                        className={`calendar-day-cell ${cell.inCurrentMonth ? '' : 'is-out-month'} ${
                          isToday ? 'is-today' : ''
                        }`}
                      >
                        <div className="calendar-day-number">{cell.date.getDate()}</div>
                        <div className="calendar-day-events">
                          {visibleEvents.map((evt) => (
                            <div
                              key={evt.id}
                              className="calendar-event-chip"
                              title={`${evt.timeLabel} - ${evt.title}`}
                            >
                              <span className="calendar-event-time">{evt.timeLabel}</span> {evt.title}
                            </div>
                          ))}
                          {dayEvents.length > visibleEvents.length && (
                            <div className="calendar-event-more">
                              +{dayEvents.length - visibleEvents.length} mais
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p>{calendarMessage || 'Sem eventos carregados no momento.'}</p>
            )}
          </div>
        </div>

        <div className="proximos-eventos">
          <h4>Proximos Eventos</h4>
          <div id="lista-eventos-container">
            {nextEvents.length > 0 ? (
              nextEvents.map((event, index) => (
                <div className="evento-item" key={`next-${index}`}>
                  <div className="evento-data">
                    <div className="dia">{event.date.getDate()}</div>
                    <div className="mes">
                      {event.date.toLocaleString('pt-BR', { month: 'short' })}
                    </div>
                  </div>
                  <div className="evento-borda" />
                  <p className="evento-titulo">
                    <span style={{ fontWeight: 700 }}>{event.timeLabel}</span> - {event.title}
                  </p>
                </div>
              ))
            ) : (
              <p>Sem proximos eventos.</p>
            )}
          </div>
        </div>
      </div>

      <section className="section_projetos">
        <div className="faixa-titulo">
          <div className="faixa-container">
            <h2>Clientes e Projetos</h2>
          </div>
        </div>

        <div className="clientes-map-shell">
          <img className="clientes-map-bg" src={clientesMapImage} alt="Mapa de clientes e projetos" />
          <div className="clientes-map-layer clientes-map-grid">
            {projects.map((project) => (
              <div key={project.id} className="clientes-item-static">
                <div className="clientes-marker">
                  {project.imagem_url ? (
                    <img src={resolveMediaUrl(project.imagem_url)} alt={project.titulo} />
                  ) : (
                    <span>{project.titulo.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <p>{project.titulo}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ultimas-noticias">
        <div className="faixa-titulo">
          <div className="faixa-container">
            <h2>COMUNICADOS</h2>
          </div>
        </div>

        <div className="my-swiper-avisos">
          {avisos.length > 0 ? (
            <>
              <a
                className="comunicados-slide"
                href={avisos[currentAvisoIndex]?.link || '#'}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  className="comunicados-img"
                  src={
                    avisos[currentAvisoIndex]?.imagem_url || 'https://via.placeholder.com/900x300'
                  }
                  alt={avisos[currentAvisoIndex]?.titulo || `Aviso ${currentAvisoIndex + 1}`}
                />
              </a>

              {avisos.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="comunicados-nav comunicados-nav-prev"
                    onClick={goToPreviousAviso}
                    aria-label="Comunicado anterior"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="comunicados-nav comunicados-nav-next"
                    onClick={goToNextAviso}
                    aria-label="Próximo comunicado"
                  >
                    ›
                  </button>
                  <div className="comunicados-dots">
                    {avisos.map((_, index) => (
                      <button
                        key={`aviso-dot-${index}`}
                        type="button"
                        className={`comunicados-dot ${index === currentAvisoIndex ? 'ativo' : ''}`}
                        onClick={() => setCurrentAvisoIndex(index)}
                        aria-label={`Ir para comunicado ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <div className="comunicados-slide">
              <p>Carregando avisos...</p>
            </div>
          )}
        </div>
      </section>

    </>
  );
}
