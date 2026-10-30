import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import {
  LEGACY_API_BASE_URL,
  legacyGetJson,
  legacyMutateJson
} from '../services/legacyApi';
import { NOTICIA_VAZIA, NoticiaForm, NoticiaFormValues } from '../components/NoticiaForm';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { AvisoFlutuante, mensagemDeErro, useAviso } from '../components/AvisoFlutuante';
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
};

export function NoticiasPage() {
  const { isAdmin, user } = useAuth();
  const { isRead, markAsRead, reload: reloadNotificacoes } = useNotifications();
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNoticia, setSelectedNoticia] = useState<Noticia | null>(null);
  const { aviso, avisar, fecharAviso } = useAviso();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingNoticia, setEditingNoticia] = useState<Noticia | null>(null);
  const autorPadrao = user?.nome_completo || 'Admin';

  useBodyScrollLock(Boolean(selectedNoticia || editingNoticia));

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
    // Mantem o sino e a sidebar sincronizados apos alteracoes de admin.
    reloadNotificacoes();
  }

  async function criarNoticia(values: NoticiaFormValues) {
    try {
      await legacyMutateJson<{ success: boolean }>('POST', '/api/admin/intranet/noticias', {
        ...values,
        autor_nome: values.autor_nome.trim() || autorPadrao
      });
      setShowCreateForm(false);
      await refreshNoticias();
      avisar('Noticia criada com sucesso.');
      return true;
    } catch (err) {
      avisar(mensagemDeErro(err, 'Falha ao criar noticia.'), 'erro');
      return false;
    }
  }

  async function excluirNoticia(id: number) {
    if (!window.confirm('Excluir esta noticia?')) return;
    try {
      await legacyMutateJson<{ success: boolean }>('DELETE', `/api/admin/intranet/noticias/${id}`);
      await refreshNoticias();
      avisar('Noticia removida.');
    } catch (err) {
      avisar(mensagemDeErro(err, 'Falha ao excluir noticia.'), 'erro');
    }
  }

  function openEditModal(noticia: Noticia) {
    setEditingNoticia(noticia);
  }

  function closeEditModal() {
    setEditingNoticia(null);
  }

  async function salvarEdicaoNoticia(values: NoticiaFormValues) {
    if (!editingNoticia?.id) return false;

    try {
      await legacyMutateJson<{ success: boolean }>(
        'PUT',
        `/api/admin/intranet/noticias/${editingNoticia.id}`,
        {
          ...values,
          autor_nome: values.autor_nome.trim() || autorPadrao
        }
      );
      await refreshNoticias();
      avisar('Noticia atualizada.');
      closeEditModal();
      return true;
    } catch (err) {
      avisar(mensagemDeErro(err, 'Falha ao atualizar noticia.'), 'erro');
      return false;
    }
  }

  function noticiaParaForm(noticia: Noticia): NoticiaFormValues {
    return {
      titulo: noticia.titulo || '',
      conteudo: noticia.conteudo || '',
      autor_nome: asText(noticia.autor_nome),
      imagem_destaque_url: asText(noticia.imagem_destaque_url),
      data_inicio: toDateTimeLocalValue(noticia.data_inicio),
      data_fim: toDateTimeLocalValue(noticia.data_fim),
      ativo: Boolean(noticia.ativo ?? 1)
    };
  }

  function openNoticiaModal(noticia: Noticia) {
    setSelectedNoticia(noticia);
    if (noticia.id) markAsRead(noticia.id);
  }

  function closeNoticiaModal() {
    setSelectedNoticia(null);
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
            {showCreateForm ? null : (
              <button
                type="button"
                className="admin-btn primary noticias-admin-add"
                onClick={() => {
                  setShowCreateForm(true);
                }}
              >
                <Plus size={16} /> Adicionar noticia
              </button>
            )}
          </div>

          {showCreateForm ? (
            <NoticiaForm
              modo="criar"
              inicial={NOTICIA_VAZIA}
              autorPadrao={autorPadrao}
              uploadImagem={uploadImageFile}
              onSubmit={criarNoticia}
              onCancel={() => setShowCreateForm(false)}
            />
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
              const isNew = Boolean(noticia.id && !isRead(noticia.id));

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
        <div className="admin-modal-overlay" onClick={closeEditModal}>
          <div
            className="admin-modal-card noticia-edit-card"
            role="dialog"
            aria-label="Editar noticia"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-head">
              <span>Editar noticia</span>
              <button type="button" className="admin-modal-close" onClick={closeEditModal}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <NoticiaForm
                key={editingNoticia.id}
                modo="editar"
                inicial={noticiaParaForm(editingNoticia)}
                autorPadrao={autorPadrao}
                uploadImagem={uploadImageFile}
                onSubmit={salvarEdicaoNoticia}
                onCancel={closeEditModal}
              />
            </div>
          </div>
        </div>
      ) : null}

      <AvisoFlutuante aviso={aviso} onClose={fecharAviso} />
    </>
  );
}
