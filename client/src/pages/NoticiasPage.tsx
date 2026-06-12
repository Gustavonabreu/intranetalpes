import { useEffect, useState } from 'react';
import { LEGACY_API_BASE_URL, legacyGetJson } from '../services/legacyApi';

type Noticia = {
  id?: number;
  titulo?: string;
  conteudo?: string;
  autor_nome?: string;
  data_publicacao?: string;
  imagem_destaque_url?: string;
  noticia_nova_info?: {
    id?: number;
  };
};

function getCsrfToken(name: string) {
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

export function NoticiasPage() {
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNoticia, setSelectedNoticia] = useState<Noticia | null>(null);
  const [readNewIds, setReadNewIds] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let mounted = true;

    async function loadNoticias() {
      setLoading(true);
      setError('');

      try {
        const data = await legacyGetJson<Noticia[]>('/api/noticias/');
        if (!mounted) return;
        setNoticias(data || []);
      } catch {
        if (!mounted) return;
        setError('Erro ao carregar noticias.');
        setNoticias([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadNoticias();
    return () => {
      mounted = false;
    };
  }, []);

  async function markNotificationAsRead(notificationId?: number) {
    if (!notificationId) return;
    const csrfToken = getCsrfToken('csrftoken');

    try {
      await fetch(`${LEGACY_API_BASE_URL}/api/notificacoes/${notificationId}/ler/`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRFToken': csrfToken } : undefined
      });
    } catch {}

    setReadNewIds((current) => ({ ...current, [notificationId]: true }));
  }

  function openNoticiaModal(noticia: Noticia) {
    setSelectedNoticia(noticia);
    markNotificationAsRead(noticia.noticia_nova_info?.id);
    document.body.classList.add('modal-open');
  }

  function closeNoticiaModal() {
    setSelectedNoticia(null);
    document.body.classList.remove('modal-open');
  }

  return (
    <>
      <div className="faixa-titulo">
        <h2>Portal de Noticias</h2>
      </div>

      <div id="noticias-container" className="noticias-grid">
        {loading ? <p>Carregando noticias...</p> : null}
        {error ? <p>{error}</p> : null}
        {!loading && !error && noticias.length === 0 ? <p>Nenhuma noticia encontrada.</p> : null}

        {!loading && !error
          ? noticias.map((noticia, index) => {
              const title = noticia.titulo || 'Noticia sem titulo';
              const content = noticia.conteudo || '';
              const preview = content.length > 150 ? `${content.substring(0, 150)}...` : content;
              const imageUrl = noticia.imagem_destaque_url || 'https://via.placeholder.com/400x200';
              const author = noticia.autor_nome || 'Admin';
              const publishedDate = noticia.data_publicacao
                ? new Date(noticia.data_publicacao).toLocaleDateString('pt-BR')
                : '--/--/----';
              const notificationId = noticia.noticia_nova_info?.id;
              const isNew = Boolean(notificationId && !readNewIds[notificationId]);

              return (
                <button
                  key={noticia.id || `${title}-${index}`}
                  type="button"
                  className={`noticia-card ${isNew ? 'noticia-nova' : ''}`}
                  onClick={() => openNoticiaModal(noticia)}
                >
                  {isNew ? <span className="botao-novidade">Novidade</span> : null}
                  <img src={imageUrl} alt={title} />
                  <div className="noticia-content">
                    <h3>{title}</h3>
                    <p>{preview}</p>
                    <div className="noticia-meta">
                      <span>Por: {author}</span>
                      <span>{publishedDate}</span>
                    </div>
                  </div>
                </button>
              );
            })
          : null}
      </div>

      {selectedNoticia ? (
        <div id="modal-noticia" className="modal" style={{ display: 'block' }} onClick={closeNoticiaModal}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <span className="close-button" onClick={closeNoticiaModal}>
              &times;
            </span>
            <h2 id="modal-noticia-titulo">{selectedNoticia.titulo || 'Noticia'}</h2>
            <p id="modal-noticia-conteudo">{selectedNoticia.conteudo || 'Sem conteudo.'}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
