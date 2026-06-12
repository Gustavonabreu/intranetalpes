import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { BarChart2, Briefcase, Image as ImageIcon, Newspaper, X } from 'lucide-react';
import {
  LEGACY_API_BASE_URL,
  LegacyApiError,
  legacyGetJson,
  legacyMutateJson
} from '../services/legacyApi';
import '../styles/admin-cms.css';

type ModalType = 'imagem' | 'noticias' | 'projetos' | 'enquetes' | null;

type IntranetConfig = {
  id?: number;
  imagem_inicial_url?: string | null;
};

type Noticia = {
  id: number;
  titulo: string;
  conteudo: string;
  autor_nome?: string | null;
  imagem_destaque_url?: string | null;
  ativo: number;
};

type Projeto = {
  id: number;
  titulo: string;
  resumo?: string | null;
  descricao?: string | null;
  descricao_detalhada?: string | null;
  imagem_url?: string | null;
  link_url?: string | null;
  tipo: 'cliente' | 'projeto';
  progresso: number;
  ativo: number;
  ordem: number;
};

type EnqueteOpcao = {
  id: number;
  enquete_id: number;
  texto_opcao: string;
  votos: number;
};

type Enquete = {
  id: number;
  pergunta: string;
  ativo: number;
  opcoes: EnqueteOpcao[];
};

function asText(value: string | null | undefined) {
  return value || '';
}

export function AdminIntranetPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [uploading, setUploading] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const [heroUrl, setHeroUrl] = useState('');

  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [novaNoticia, setNovaNoticia] = useState({
    titulo: '',
    conteudo: '',
    autor_nome: '',
    imagem_destaque_url: '',
    ativo: true
  });

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [novoProjeto, setNovoProjeto] = useState({
    titulo: '',
    resumo: '',
    descricao: '',
    descricao_detalhada: '',
    imagem_url: '',
    link_url: '',
    tipo: 'cliente' as 'cliente' | 'projeto',
    progresso: 0,
    ordem: 0,
    ativo: true
  });

  const [enquetes, setEnquetes] = useState<Enquete[]>([]);
  const [novaEnquete, setNovaEnquete] = useState({ pergunta: '', ativo: true });
  const [novaOpcaoPorEnquete, setNovaOpcaoPorEnquete] = useState<Record<number, string>>({});

  const modulos = [
    {
      id: 'imagem' as const,
      title: 'Imagem Inicial',
      description: 'Altere o banner principal da intranet',
      icon: <ImageIcon size={36} />
    },
    {
      id: 'noticias' as const,
      title: 'Noticias',
      description: 'Gerencie os comunicados e postagens',
      icon: <Newspaper size={36} />
    },
    {
      id: 'projetos' as const,
      title: 'Projetos e Clientes',
      description: 'Cadastre novos projetos ou clientes',
      icon: <Briefcase size={36} />
    },
    {
      id: 'enquetes' as const,
      title: 'Enquetes',
      description: 'Crie ou encerre as enquetes da semana',
      icon: <BarChart2 size={36} />
    }
  ];

  async function loadAll() {
    setLoading(true);
    setFeedback('');
    try {
      const [config, news, projects, polls] = await Promise.all([
        legacyGetJson<IntranetConfig>('/api/admin/intranet/config'),
        legacyGetJson<Noticia[]>('/api/admin/intranet/noticias'),
        legacyGetJson<Projeto[]>('/api/admin/intranet/projetos'),
        legacyGetJson<Enquete[]>('/api/admin/intranet/enquetes')
      ]);

      setHeroUrl(resolveMediaUrl(asText(config.imagem_inicial_url)));
      setNoticias(
        (news || []).map((item) => ({
          ...item,
          imagem_destaque_url: resolveMediaUrl(asText(item.imagem_destaque_url))
        }))
      );
      setProjetos(
        (projects || []).map((item) => ({
          ...item,
          resumo: asText(item.resumo),
          descricao: asText(item.descricao),
          descricao_detalhada: asText(item.descricao_detalhada),
          imagem_url: resolveMediaUrl(asText(item.imagem_url)),
          link_url: asText(item.link_url),
          tipo: item.tipo === 'projeto' ? 'projeto' : 'cliente',
        }))
      );
      setEnquetes(polls || []);
      setForbidden(false);
    } catch (error) {
      if (error instanceof LegacyApiError && error.status === 403) {
        setForbidden(true);
      } else {
        setFeedback('Falha ao carregar dados do painel.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function resolveMediaUrl(url: string) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
    if (url.startsWith('/')) return `${LEGACY_API_BASE_URL}${url}`;
    return `${LEGACY_API_BASE_URL}/${url}`;
  }

  async function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImageFile(file: File, folder: string) {
    const dataUrl = await fileToDataUrl(file);
    const response = await legacyMutateJson<{ success: boolean; url: string }>(
      'POST',
      '/api/admin/intranet/upload-image',
      {
        data_url: dataUrl,
        file_name: file.name,
        folder
      }
    );
    return resolveMediaUrl(response.url);
  }

  async function salvarConfig() {
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', '/api/admin/intranet/config', {
        imagem_inicial_url: heroUrl.trim()
      });
      setFeedback('Imagem inicial atualizada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar imagem inicial.');
    }
  }

  async function uploadHeroImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file, 'intranet/hero');
      setHeroUrl(url);
      setFeedback('Imagem enviada. Clique em "Salvar imagem" para confirmar.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function criarNoticia(event: FormEvent) {
    event.preventDefault();
    try {
      await legacyMutateJson<{ success: boolean }>('POST', '/api/admin/intranet/noticias', {
        ...novaNoticia,
        ativo: novaNoticia.ativo
      });
      setNovaNoticia({ titulo: '', conteudo: '', autor_nome: '', imagem_destaque_url: '', ativo: true });
      await loadAll();
      setFeedback('Noticia criada com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao criar noticia.');
    }
  }

  async function uploadNovaNoticiaImagem(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file, 'intranet/noticias');
      setNovaNoticia((prev) => ({ ...prev, imagem_destaque_url: url }));
      setFeedback('Imagem da noticia enviada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao enviar imagem da noticia.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function uploadNoticiaImagem(
    noticiaId: number,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file, 'intranet/noticias');
      setNoticias((prev) =>
        prev.map((item) => (item.id === noticiaId ? { ...item, imagem_destaque_url: url } : item))
      );
      setFeedback('Imagem atualizada na noticia. Clique em "Salvar".');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function salvarNoticia(item: Noticia) {
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', `/api/admin/intranet/noticias/${item.id}`, {
        ...item,
        ativo: Boolean(item.ativo)
      });
      setFeedback('Noticia atualizada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao atualizar noticia.');
    }
  }

  async function excluirNoticia(id: number) {
    if (!window.confirm('Excluir esta noticia?')) return;
    try {
      await legacyMutateJson<{ success: boolean }>('DELETE', `/api/admin/intranet/noticias/${id}`);
      setNoticias((prev) => prev.filter((item) => item.id !== id));
      setFeedback('Noticia removida.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao excluir noticia.');
    }
  }

  async function criarProjeto(event: FormEvent) {
    event.preventDefault();
    try {
      await legacyMutateJson<{ success: boolean }>('POST', '/api/admin/intranet/projetos', {
        ...novoProjeto,
        ativo: novoProjeto.ativo
      });
      setNovoProjeto({
        titulo: '',
        resumo: '',
        descricao: '',
        descricao_detalhada: '',
        imagem_url: '',
        link_url: '',
        tipo: 'cliente',
        progresso: 0,
        ordem: 0,
        ativo: true
      });
      await loadAll();
      setFeedback('Projeto criado com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao criar projeto.');
    }
  }

  async function uploadNovoProjetoImagem(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file, 'intranet/projetos');
      setNovoProjeto((prev) => ({ ...prev, imagem_url: url }));
      setFeedback('Imagem de projeto/cliente enviada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function uploadProjetoImagem(
    projetoId: number,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file, 'intranet/projetos');
      setProjetos((prev) =>
        prev.map((item) => (item.id === projetoId ? { ...item, imagem_url: url } : item))
      );
      setFeedback('Imagem atualizada no item. Clique em "Salvar".');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function salvarProjeto(item: Projeto) {
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', `/api/admin/intranet/projetos/${item.id}`, {
        ...item,
        ativo: Boolean(item.ativo)
      });
      setFeedback('Projeto atualizado.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao atualizar projeto.');
    }
  }

  async function excluirProjeto(id: number) {
    if (!window.confirm('Excluir este projeto?')) return;
    try {
      await legacyMutateJson<{ success: boolean }>('DELETE', `/api/admin/intranet/projetos/${id}`);
      setProjetos((prev) => prev.filter((item) => item.id !== id));
      setFeedback('Projeto removido.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao excluir projeto.');
    }
  }

  async function criarEnquete(event: FormEvent) {
    event.preventDefault();
    try {
      await legacyMutateJson<{ success: boolean }>('POST', '/api/admin/intranet/enquetes', {
        pergunta: novaEnquete.pergunta,
        ativo: novaEnquete.ativo
      });
      setNovaEnquete({ pergunta: '', ativo: true });
      await loadAll();
      setFeedback('Enquete criada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao criar enquete.');
    }
  }

  async function salvarEnquete(item: Enquete) {
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', `/api/admin/intranet/enquetes/${item.id}`, {
        pergunta: item.pergunta,
        ativo: Boolean(item.ativo)
      });
      setFeedback('Enquete atualizada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao atualizar enquete.');
    }
  }

  async function ativarEnquete(id: number) {
    try {
      await legacyMutateJson<{ success: boolean }>('POST', `/api/admin/intranet/enquetes/${id}/ativar`);
      await loadAll();
      setFeedback('Enquete ativada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao ativar enquete.');
    }
  }

  async function excluirEnquete(id: number) {
    if (!window.confirm('Excluir esta enquete?')) return;
    try {
      await legacyMutateJson<{ success: boolean }>('DELETE', `/api/admin/intranet/enquetes/${id}`);
      setEnquetes((prev) => prev.filter((item) => item.id !== id));
      setFeedback('Enquete removida.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao excluir enquete.');
    }
  }

  async function criarOpcao(enqueteId: number) {
    const texto = (novaOpcaoPorEnquete[enqueteId] || '').trim();
    if (!texto) return;
    try {
      await legacyMutateJson<{ success: boolean }>(
        'POST',
        `/api/admin/intranet/enquetes/${enqueteId}/opcoes`,
        { texto_opcao: texto }
      );
      setNovaOpcaoPorEnquete((prev) => ({ ...prev, [enqueteId]: '' }));
      await loadAll();
      setFeedback('Opcao adicionada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao adicionar opcao.');
    }
  }

  async function salvarOpcao(opcao: EnqueteOpcao) {
    try {
      await legacyMutateJson<{ success: boolean }>(
        'PUT',
        `/api/admin/intranet/enquetes/opcoes/${opcao.id}`,
        { texto_opcao: opcao.texto_opcao }
      );
      setFeedback('Opcao atualizada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao atualizar opcao.');
    }
  }

  async function excluirOpcao(id: number) {
    try {
      await legacyMutateJson<{ success: boolean }>('DELETE', `/api/admin/intranet/enquetes/opcoes/${id}`);
      await loadAll();
      setFeedback('Opcao removida.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao remover opcao.');
    }
  }

  function renderImagemContent() {
    return (
      <div className="admin-block">
        <h3>Atualizar imagem inicial</h3>
        <label>
          URL da imagem
          <input value={heroUrl} onChange={(e) => setHeroUrl(e.target.value)} />
        </label>
        <label>
          Enviar arquivo
          <input type="file" accept="image/*" onChange={uploadHeroImage} />
        </label>
        {uploading ? <small>Enviando imagem...</small> : null}
        <button type="button" onClick={salvarConfig}>Salvar imagem</button>
      </div>
    );
  }

  function renderNoticiasContent() {
    return (
      <div className="admin-block">
        <h3>Noticias</h3>
        <form onSubmit={criarNoticia} className="admin-form-grid">
          <input placeholder="Titulo" value={novaNoticia.titulo} onChange={(e) => setNovaNoticia((p) => ({ ...p, titulo: e.target.value }))} required />
          <input placeholder="Autor" value={novaNoticia.autor_nome} onChange={(e) => setNovaNoticia((p) => ({ ...p, autor_nome: e.target.value }))} />
          <input placeholder="URL da imagem" value={novaNoticia.imagem_destaque_url} onChange={(e) => setNovaNoticia((p) => ({ ...p, imagem_destaque_url: e.target.value }))} />
          <input type="file" accept="image/*" onChange={uploadNovaNoticiaImagem} />
          <textarea placeholder="Conteudo" value={novaNoticia.conteudo} onChange={(e) => setNovaNoticia((p) => ({ ...p, conteudo: e.target.value }))} required />
          <label className="check">
            <input type="checkbox" checked={novaNoticia.ativo} onChange={(e) => setNovaNoticia((p) => ({ ...p, ativo: e.target.checked }))} />
            Ativa
          </label>
          {uploading ? <small>Enviando imagem...</small> : null}
          <button type="submit">Publicar noticia</button>
        </form>

        {noticias.map((item) => (
          <div className="admin-item" key={item.id}>
            <input value={item.titulo} onChange={(e) => setNoticias((prev) => prev.map((n) => (n.id === item.id ? { ...n, titulo: e.target.value } : n)))} />
            <input value={asText(item.autor_nome)} onChange={(e) => setNoticias((prev) => prev.map((n) => (n.id === item.id ? { ...n, autor_nome: e.target.value } : n)))} />
            <input value={asText(item.imagem_destaque_url)} onChange={(e) => setNoticias((prev) => prev.map((n) => (n.id === item.id ? { ...n, imagem_destaque_url: e.target.value } : n)))} />
            <input type="file" accept="image/*" onChange={(e) => uploadNoticiaImagem(item.id, e)} />
            <textarea value={item.conteudo} onChange={(e) => setNoticias((prev) => prev.map((n) => (n.id === item.id ? { ...n, conteudo: e.target.value } : n)))} />
            <label className="check">
              <input type="checkbox" checked={Boolean(item.ativo)} onChange={(e) => setNoticias((prev) => prev.map((n) => (n.id === item.id ? { ...n, ativo: e.target.checked ? 1 : 0 } : n)))} />
              Ativa
            </label>
            <div className="admin-actions">
              <button type="button" onClick={() => salvarNoticia(item)}>Salvar</button>
              <button type="button" className="danger" onClick={() => excluirNoticia(item.id)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderProjetosContent() {
    return (
      <div className="admin-block">
        <h3>Projetos e clientes</h3>
        <form onSubmit={criarProjeto} className="admin-form-grid">
          <input placeholder="Titulo" value={novoProjeto.titulo} onChange={(e) => setNovoProjeto((p) => ({ ...p, titulo: e.target.value }))} required />
          <select value={novoProjeto.tipo} onChange={(e) => setNovoProjeto((p) => ({ ...p, tipo: (e.target.value === 'projeto' ? 'projeto' : 'cliente') }))}>
            <option value="cliente">Cliente</option>
            <option value="projeto">Projeto</option>
          </select>
          <input placeholder="URL da imagem" value={novoProjeto.imagem_url} onChange={(e) => setNovoProjeto((p) => ({ ...p, imagem_url: e.target.value }))} />
          <input type="file" accept="image/*" onChange={uploadNovoProjetoImagem} />
          <input placeholder="Link (opcional)" value={novoProjeto.link_url} onChange={(e) => setNovoProjeto((p) => ({ ...p, link_url: e.target.value }))} />
          <input type="number" min={0} max={100} placeholder="Progresso" value={novoProjeto.progresso} onChange={(e) => setNovoProjeto((p) => ({ ...p, progresso: Number(e.target.value) || 0 }))} />
          <input type="number" min={0} placeholder="Ordem" value={novoProjeto.ordem} onChange={(e) => setNovoProjeto((p) => ({ ...p, ordem: Number(e.target.value) || 0 }))} />
          <textarea placeholder="Resumo curto" value={novoProjeto.resumo} onChange={(e) => setNovoProjeto((p) => ({ ...p, resumo: e.target.value }))} />
          <textarea placeholder="Descricao curta" value={novoProjeto.descricao} onChange={(e) => setNovoProjeto((p) => ({ ...p, descricao: e.target.value }))} />
          <textarea placeholder="Descricao detalhada" value={novoProjeto.descricao_detalhada} onChange={(e) => setNovoProjeto((p) => ({ ...p, descricao_detalhada: e.target.value }))} />
          <label className="check">
            <input type="checkbox" checked={novoProjeto.ativo} onChange={(e) => setNovoProjeto((p) => ({ ...p, ativo: e.target.checked }))} />
            Ativo
          </label>
          {uploading ? <small>Enviando imagem...</small> : null}
          <button type="submit">Salvar projeto</button>
        </form>

        {projetos.map((item) => (
          <div className="admin-item" key={item.id}>
            <input value={item.titulo} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, titulo: e.target.value } : p)))} />
            <select value={item.tipo} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, tipo: (e.target.value === 'projeto' ? 'projeto' : 'cliente') } : p)))}>
              <option value="cliente">Cliente</option>
              <option value="projeto">Projeto</option>
            </select>
            <input value={asText(item.imagem_url)} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, imagem_url: e.target.value } : p)))} />
            <input type="file" accept="image/*" onChange={(e) => uploadProjetoImagem(item.id, e)} />
            <input value={asText(item.link_url)} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, link_url: e.target.value } : p)))} />
            <input type="number" min={0} max={100} value={item.progresso} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, progresso: Number(e.target.value) || 0 } : p)))} />
            <input type="number" min={0} value={item.ordem} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, ordem: Number(e.target.value) || 0 } : p)))} />
            <textarea value={asText(item.resumo)} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, resumo: e.target.value } : p)))} />
            <textarea value={asText(item.descricao)} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, descricao: e.target.value } : p)))} />
            <textarea value={asText(item.descricao_detalhada)} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, descricao_detalhada: e.target.value } : p)))} />
            <label className="check">
              <input type="checkbox" checked={Boolean(item.ativo)} onChange={(e) => setProjetos((prev) => prev.map((p) => (p.id === item.id ? { ...p, ativo: e.target.checked ? 1 : 0 } : p)))} />
              Ativo
            </label>
            <div className="admin-actions">
              <button type="button" onClick={() => salvarProjeto(item)}>Salvar</button>
              <button type="button" className="danger" onClick={() => excluirProjeto(item.id)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderEnquetesContent() {
    return (
      <div className="admin-block">
        <h3>Enquetes</h3>
        <form onSubmit={criarEnquete} className="admin-form-grid">
          <input placeholder="Pergunta da enquete" value={novaEnquete.pergunta} onChange={(e) => setNovaEnquete((p) => ({ ...p, pergunta: e.target.value }))} required />
          <label className="check">
            <input type="checkbox" checked={novaEnquete.ativo} onChange={(e) => setNovaEnquete((p) => ({ ...p, ativo: e.target.checked }))} />
            Criar como ativa
          </label>
          <button type="submit">Criar enquete</button>
        </form>

        {enquetes.map((item) => (
          <div className="admin-item" key={item.id}>
            <input value={item.pergunta} onChange={(e) => setEnquetes((prev) => prev.map((p) => (p.id === item.id ? { ...p, pergunta: e.target.value } : p)))} />
            <label className="check">
              <input type="checkbox" checked={Boolean(item.ativo)} onChange={(e) => setEnquetes((prev) => prev.map((p) => (p.id === item.id ? { ...p, ativo: e.target.checked ? 1 : 0 } : p)))} />
              Ativa
            </label>
            <div className="admin-actions">
              <button type="button" onClick={() => salvarEnquete(item)}>Salvar</button>
              <button type="button" onClick={() => ativarEnquete(item.id)}>Ativar</button>
              <button type="button" className="danger" onClick={() => excluirEnquete(item.id)}>Excluir</button>
            </div>

            <div className="admin-options">
              {item.opcoes.map((opcao) => (
                <div key={opcao.id} className="admin-option-row">
                  <input value={opcao.texto_opcao} onChange={(e) => setEnquetes((prev) => prev.map((poll) => poll.id === item.id ? { ...poll, opcoes: poll.opcoes.map((o) => o.id === opcao.id ? { ...o, texto_opcao: e.target.value } : o) } : poll ))} />
                  <small>{opcao.votos} voto(s)</small>
                  <button type="button" onClick={() => salvarOpcao(opcao)}>Salvar opcao</button>
                  <button type="button" className="danger" onClick={() => excluirOpcao(opcao.id)}>Excluir</button>
                </div>
              ))}

              <div className="admin-option-row">
                <input placeholder="Nova opcao" value={novaOpcaoPorEnquete[item.id] || ''} onChange={(e) => setNovaOpcaoPorEnquete((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                <button type="button" onClick={() => criarOpcao(item.id)}>Adicionar opcao</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderModalContent() {
    switch (activeModal) {
      case 'imagem':
        return renderImagemContent();
      case 'noticias':
        return renderNoticiasContent();
      case 'projetos':
        return renderProjetosContent();
      case 'enquetes':
        return renderEnquetesContent();
      default:
        return null;
    }
  }

  if (loading) return <p>Carregando painel administrativo...</p>;
  if (forbidden) return <p>Seu usuario nao tem permissao para acessar este painel.</p>;

  return (
    <section className="admin-panel-shell">
      <div className="admin-panel-head">
        <h2>Painel Administrativo da Intranet</h2>
        {feedback ? <p className="admin-feedback">{feedback}</p> : null}
      </div>

      <div className="admin-modules-grid">
        {modulos.map((modulo) => (
          <button
            key={modulo.id}
            onClick={() => setActiveModal(modulo.id)}
            className="admin-module-card"
            type="button"
          >
            <div className="admin-module-icon">{modulo.icon}</div>
            <h3>{modulo.title}</h3>
            <p>{modulo.description}</p>
          </button>
        ))}
      </div>

      {activeModal ? (
        <div className="admin-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="admin-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-head">
              <span>Administracao</span>
              <button type="button" className="admin-modal-close" onClick={() => setActiveModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">{renderModalContent()}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
