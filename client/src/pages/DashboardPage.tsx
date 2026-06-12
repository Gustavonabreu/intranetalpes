import { useEffect, useMemo, useState } from 'react';
import clientesMapImage from '../assets/brand/clientes-map.png';
import { LEGACY_API_BASE_URL, legacyGetJson } from '../services/legacyApi';

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

export function DashboardPage() {
  const [userName, setUserName] = useState('Usuario');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [heroImage, setHeroImage] = useState(
    'https://dummyimage.com/1600x900/0f172a/ffffff&text=Intranet+Alpes'
  );

  function resolveMediaUrl(url: string) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
    if (url.startsWith('/')) return `${LEGACY_API_BASE_URL}${url}`;
    return `${LEGACY_API_BASE_URL}/${url}`;
  }

  useEffect(() => {
    let mounted = true;

    async function loadDashboardData() {
      try {
        const user = await legacyGetJson<{ nome_completo?: string }>('/api/auth/user/');
        if (mounted && user.nome_completo) {
          setUserName(user.nome_completo.split(' ')[0] || 'Usuario');
        }
      } catch {}

      try {
        const eventsData = await legacyGetJson<CalendarEvent[]>('/api/calendar/events/');
        if (mounted) setEvents(eventsData || []);
      } catch {
        if (mounted) setEvents([]);
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

  const nextEvents = useMemo(() => events.slice(0, 4), [events]);

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
          <h3>Calendario</h3>
          <div id="meu-calendario-container">
            {events.length > 0 ? (
              <ul className="lista-eventos-calendario">
                {events.map((event, index) => (
                  <li key={`${event.summary}-${index}`}>{event.summary || 'Evento sem titulo'}</li>
                ))}
              </ul>
            ) : (
              <p>Sem eventos carregados no momento.</p>
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
                    <div className="dia">
                      {new Date(event.start?.dateTime || event.start?.date || Date.now()).getDate()}
                    </div>
                    <div className="mes">
                      {new Date(
                        event.start?.dateTime || event.start?.date || Date.now()
                      ).toLocaleString('pt-BR', { month: 'short' })}
                    </div>
                  </div>
                  <div className="evento-borda" />
                  <p className="evento-titulo">{event.summary || 'Evento sem titulo'}</p>
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

        <div className="swiper my-swiper-avisos">
          <div className="swiper-wrapper">
            {avisos.length > 0 ? (
              avisos.map((aviso, index) => (
                <div className="swiper-slide" key={aviso.id || index}>
                  <a href={aviso.link || '#'} target="_blank" rel="noreferrer">
                    <img
                      src={aviso.imagem_url || 'https://via.placeholder.com/900x300'}
                      alt={aviso.titulo || `Aviso ${index + 1}`}
                    />
                  </a>
                </div>
              ))
            ) : (
              <div className="swiper-slide">
                <p>Carregando avisos...</p>
              </div>
            )}
          </div>
        </div>
      </section>

    </>
  );
}
