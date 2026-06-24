import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import {
  LEGACY_API_BASE_URL,
  legacyGetJson,
  legacyMutateJson
} from '../services/legacyApi';
import '../styles/admin-cms.css';

type Noticia = {
  id: number;
  titulo: string;
  conteudo: string;
  autor_nome?: string | null;
  data_publicacao?: string | null;
  imagem_destaque_url?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  ativo?: number;
  noticia_nova_info?: {
    id?: number;
  };
};

type NovaNoticia = {
  titulo: string;
  conteudo: string;
  autor_nome: string;
  imagem_destaque_url: string;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
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
  const { isAdmin, user } = useAuth();
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNoticia, setSelectedNoticia] = useState<Noticia | null>(null);
  const [readNewIds, setReadNewIds] = useState<Record<number, boolean>>({});
  const [adminFeedback, setAdminFeedback] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingNoticia, setEditingNoticia] = useState<Noticia | null>(null);
  const [novaNoticia, setNovaNoticia] = useState<NovaNoticia>({
    titulo: '',
    conteudo: '',
    autor_nome: '',
    imagem_destaque_url: '',
    data_inicio: '',
    data_fim: '',
    ativo: true
  });

  function asText(value: string | null | undefined) {
    return value || '';
  }

  function toDateTimeLocalValue(value: string | null | undefined) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.replace(' ', 'T');
    return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
  }

  function resolveMediaUrl(url: string | null | undefined) {
    const normalized = String(url || '').trim();
    if (!normalized) return '';
    if (/^https?:\/\//i.test(normalized) || normalized.startsWith('data:')) return normalized;
    if (normalized.startsWith('/')) return `${LEGACY_API_BASE_URL}${normalized}`;
    return `${LEGACY_API_BASE_URL}/${normalized}`;
  }

  useEffect(() => {
    let mounted = true;

    async function loadNoticias() {
      setLoading(true);
      setError('');

      try {
        const data = await legacyGetJson<Noticia[]>('/api/noticias/');
        if (!mounted) return;
        setNoticias(
          (data || []).map((item) => ({
            ...item,
            imagem_destaque_url: resolveMediaUrl(item.imagem_destaque_url)
          }))
        );
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

  async function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImageFile(file: File) {
    const dataUrl = await fileToDataUrl(file);
    const response = await legacyMutateJson<{ success: boolean; url: string }>(
      'POST',
      '/api/admin/intranet/upload-image',
      {
        data_url: dataUrl,
        file_name: file.name,
        folder: 'intranet/noticias'
      }
    );
    return resolveMediaUrl(response.url);
  }

  async function refreshNoticias() {
    const data = await legacyGetJson<Noticia[]>('/api/noticias/');
    setNoticias(
      (data || []).map((item) => ({
        ...item,
        imagem_destaque_url: resolveMediaUrl(item.imagem_destaque_url)
      }))
    );
  }

  async function criarNoticia(event: FormEvent) {
    event.preventDefault();
    setAdminFeedback('');
    try {
      await legacyMutateJson<{ success: boolean }>('POST', '/api/admin/intranet/noticias', {
        ...novaNoticia,
        autor_nome: novaNoticia.autor_nome.trim() || user?.nome_completo || 'Admin'
      });
      setNovaNoticia({
        titulo: '',
        conteudo: '',
        autor_nome: '',
        imagem_destaque_url: '',
        data_inicio: '',
        data_fim: '',
        ativo: true
      });
      setShowCreateForm(false);
      await refreshNoticias();
      setAdminFeedback('Noticia criada com sucesso.');
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Falha ao criar noticia.');
    }
  }

  async function excluirNoticia(id: number) {
    if (!window.confirm('Excluir esta noticia?')) return;
    setAdminFeedback('');
    try {
      await legacyMutateJson<{ success: boolean }>('DELETE', `/api/admin/intranet/noticias/${id}`);
      await refreshNoticias();
      setAdminFeedback('Noticia removida.');
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Falha ao excluir noticia.');
    }
  }

  function openEditModal(noticia: Noticia) {
    setEditingNoticia({
      ...noticia,
      data_inicio: toDateTimeLocalValue(noticia.data_inicio),
      data_fim: toDateTimeLocalValue(noticia.data_fim)
    });
    document.body.classList.add('modal-open');
  }

  function closeEditModal() {
    setEditingNoticia(null);
    document.body.classList.remove('modal-open');
  }

  async function salvarEdicaoNoticia(event: FormEvent) {
    event.preventDefault();
    if (!editingNoticia?.id) return;
    setAdminFeedback('');

    try {
      await legacyMutateJson<{ success: boolean }>(
        'PUT',
        `/api/admin/intranet/noticias/${editingNoticia.id}`,
        {
          ...editingNoticia,
          ativo: Boolean(editingNoticia.ativo ?? 1)
        }
      );
      await refreshNoticias();
      setAdminFeedback('Noticia atualizada.');
      closeEditModal();
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Falha ao atualizar noticia.');
    }
  }

  async function uploadNovaNoticiaImagem(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file);
      setNovaNoticia((prev) => ({ ...prev, imagem_destaque_url: url }));
      setAdminFeedback('Imagem da noticia enviada.');
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function uploadNoticiaEdicaoImagem(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !editingNoticia) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file);
      setEditingNoticia((prev) => (prev ? { ...prev, imagem_destaque_url: url } : prev));
      setAdminFeedback('Imagem da noticia enviada.');
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
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

      {isAdmin ? (
        <section className="noticias-admin-panel admin-block">
          <div className="noticias-admin-head">
            <h3>Gestao de Noticias</h3>
            <button type="button" onClick={() => setShowCreateForm((prev) => !prev)}>
              {showCreateForm ? 'Fechar cadastro' : 'Adicionar noticia'}
            </button>
          </div>
          {adminFeedback ? <p className="admin-feedback">{adminFeedback}</p> : null}

          {showCreateForm ? (
            <form onSubmit={criarNoticia} className="admin-form-grid">
              <input
                placeholder="Titulo"
                value={novaNoticia.titulo}
                onChange={(e) => setNovaNoticia((prev) => ({ ...prev, titulo: e.target.value }))}
                required
              />
              <input
                placeholder="Autor"
                value={novaNoticia.autor_nome}
                onChange={(e) =>
                  setNovaNoticia((prev) => ({ ...prev, autor_nome: e.target.value }))
                }
              />
              <input
                placeholder="URL da imagem"
                value={novaNoticia.imagem_destaque_url}
                onChange={(e) =>
                  setNovaNoticia((prev) => ({
                    ...prev,
                    imagem_destaque_url: e.target.value
                  }))
                }
              />
              <input
                type="datetime-local"
                value={novaNoticia.data_inicio}
                onChange={(e) =>
                  setNovaNoticia((prev) => ({ ...prev, data_inicio: e.target.value }))
                }
              />
              <input
                type="datetime-local"
                value={novaNoticia.data_fim}
                onChange={(e) =>
                  setNovaNoticia((prev) => ({ ...prev, data_fim: e.target.value }))
                }
              />
              <input type="file" accept="image/*" onChange={uploadNovaNoticiaImagem} />
              <textarea
                placeholder="Conteudo"
                value={novaNoticia.conteudo}
                onChange={(e) =>
                  setNovaNoticia((prev) => ({ ...prev, conteudo: e.target.value }))
                }
                required
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={novaNoticia.ativo}
                  onChange={(e) =>
                    setNovaNoticia((prev) => ({ ...prev, ativo: e.target.checked }))
                  }
                />
                Ativa
              </label>
              {uploading ? <small>Enviando imagem...</small> : null}
              <button type="submit">Publicar noticia</button>
            </form>
          ) : null}
        </section>
      ) : null}

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
                <article
                  key={noticia.id || `${title}-${index}`}
                  className={`noticia-card ${isNew ? 'noticia-nova' : ''}`}
                  onClick={() => openNoticiaModal(noticia)}
                >
                  {isAdmin ? (
                    <div
                      className="noticia-admin-actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button type="button" onClick={() => openEditModal(noticia)}>
                        Editar
                      </button>
                      <button type="button" className="danger" onClick={() => excluirNoticia(noticia.id)}>
                        Excluir
                      </button>
                    </div>
                  ) : null}
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
                </article>
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
            <img
              className="modal-noticia-imagem"
              src={selectedNoticia.imagem_destaque_url || 'https://via.placeholder.com/900x420'}
              alt={selectedNoticia.titulo || 'Imagem da noticia'}
            />
            <p id="modal-noticia-conteudo">{selectedNoticia.conteudo || 'Sem conteudo.'}</p>
          </div>
        </div>
      ) : null}

      {editingNoticia ? (
        <div className="modal" style={{ display: 'block' }} onClick={closeEditModal}>
          <div className="modal-content admin-item" onClick={(event) => event.stopPropagation()}>
            <span className="close-button" onClick={closeEditModal}>
              &times;
            </span>
            <h2>Editar noticia</h2>
            <form className="admin-form-grid" onSubmit={salvarEdicaoNoticia}>
              <input
                value={editingNoticia.titulo}
                onChange={(e) =>
                  setEditingNoticia((prev) => (prev ? { ...prev, titulo: e.target.value } : prev))
                }
                required
              />
              <input
                value={asText(editingNoticia.autor_nome)}
                onChange={(e) =>
                  setEditingNoticia((prev) =>
                    prev ? { ...prev, autor_nome: e.target.value } : prev
                  )
                }
              />
              <input
                value={asText(editingNoticia.imagem_destaque_url)}
                onChange={(e) =>
                  setEditingNoticia((prev) =>
                    prev ? { ...prev, imagem_destaque_url: e.target.value } : prev
                  )
                }
              />
              <input
                type="datetime-local"
                value={toDateTimeLocalValue(editingNoticia.data_inicio)}
                onChange={(e) =>
                  setEditingNoticia((prev) =>
                    prev ? { ...prev, data_inicio: e.target.value } : prev
                  )
                }
              />
              <input
                type="datetime-local"
                value={toDateTimeLocalValue(editingNoticia.data_fim)}
                onChange={(e) =>
                  setEditingNoticia((prev) =>
                    prev ? { ...prev, data_fim: e.target.value } : prev
                  )
                }
              />
              <input type="file" accept="image/*" onChange={uploadNoticiaEdicaoImagem} />
              <textarea
                value={editingNoticia.conteudo}
                onChange={(e) =>
                  setEditingNoticia((prev) =>
                    prev ? { ...prev, conteudo: e.target.value } : prev
                  )
                }
                required
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(editingNoticia.ativo ?? 1)}
                  onChange={(e) =>
                    setEditingNoticia((prev) =>
                      prev ? { ...prev, ativo: e.target.checked ? 1 : 0 } : prev
                    )
                  }
                />
                Ativa
              </label>
              {uploading ? <small>Enviando imagem...</small> : null}
              <div className="admin-actions">
                <button type="submit">Salvar</button>
                <button type="button" className="danger" onClick={closeEditModal}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
