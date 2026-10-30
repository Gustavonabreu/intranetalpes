import { ChangeEvent, DragEvent, FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Clapperboard,
  Image as ImageIcon,
  ListOrdered,
  PartyPopper,
  Sparkles,
  UploadCloud,
  Youtube,
  X
} from 'lucide-react';
import defaultHeroImage from '../assets/brand/inicio_padrao.png';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { VideoFundo } from '../components/VideoFundo';
import { AvisoFlutuante, mensagemDeErro, useAviso } from '../components/AvisoFlutuante';
import { AdminFotoCampanhas } from '../components/AdminFotoCampanhas';
import { AdminTemaFestivo } from '../components/AdminTemaFestivo';
import { TemaFestivoModo, useTemaFestivo } from '../temas/TemaFestivo';
import mountainImage from '../assets/brand/montanha.png';
import { validarImagemUpload } from '../utils/imagemUpload';
import {
  LEGACY_API_BASE_URL,
  LegacyApiError,
  legacyGetJson,
  legacyMutateJson
} from '../services/legacyApi';
import { getYoutubeEmbedUrl } from '../utils/youtube';
import {
  AdminEventosCalendario,
  EventoIntranet,
  NovoEventoIntranet,
  SedeAlvo
} from '../components/AdminEventosCalendario';
import '../styles/admin-cms.css';

type ModalType = 'imagem' | 'eventos' | 'falaAlpes' | 'setores' | 'sobre' | 'campanhas' | 'tema' | null;

type IntranetConfig = {
  id?: number;
  imagem_inicial_url?: string | null;
  fala_alpes_video_url?: string | null;
  sobre_video_url?: string | null;
  tema_festivo?: TemaFestivoModo | null;
};

type Noticia = {
  id: number;
  titulo: string;
  conteudo: string;
  autor_nome?: string | null;
  imagem_destaque_url?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  ativo: number;
};

type SetorOrdem = {
  setor: string;
  configurado: boolean;
};

// Imagem inicial do Dashboard (.telainicio): faixa de 450px de altura (240px <= 1024px)
// com background-size: cover. A largura varia com a tela e a barra lateral, entao a
// proporcao visivel vai de ~1,4:1 (celular) a ~3,8:1 (monitor grande com widgets recolhidos).
const HERO_RECOMENDADO = { largura: 1920, altura: 720 };
const HERO_LARGURA_MINIMA = 1600;
const HERO_RECORTES = [
  { label: 'Monitor grande', ratio: 3.4 },
  { label: 'Notebook', ratio: 2 },
  { label: 'Celular', ratio: 1.4 }
];

function asText(value: string | null | undefined) {
  return value || '';
}

function toDateTimeLocalValue(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(' ', 'T');
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
}

export function AdminIntranetPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const { aviso, avisar, fecharAviso } = useAviso();
  const [uploading, setUploading] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const [heroUrl, setHeroUrl] = useState('');
  const [heroDims, setHeroDims] = useState<{ largura: number; altura: number } | null>(null);
  const [heroDragOver, setHeroDragOver] = useState(false);
  const [falaAlpesVideoUrl, setFalaAlpesVideoUrl] = useState('');
  const [sobreVideoUrl, setSobreVideoUrl] = useState('');

  useBodyScrollLock(activeModal !== null);

  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [novaNoticia, setNovaNoticia] = useState({
    titulo: '',
    conteudo: '',
    autor_nome: '',
    imagem_destaque_url: '',
    data_inicio: '',
    data_fim: '',
    ativo: true
  });

  const [eventos, setEventos] = useState<EventoIntranet[]>([]);

  const [setores, setSetores] = useState<SetorOrdem[]>([]);
  const [temaFestivoModo, setTemaFestivoModo] = useState<TemaFestivoModo>('auto');
  const { recarregar: recarregarTemaFestivo } = useTemaFestivo();

  const modulos = [
    {
      id: 'imagem' as const,
      title: 'Imagem Inicial',
      description: 'Altere o banner principal da intranet',
      icon: <ImageIcon size={36} />
    },
    {
      id: 'eventos' as const,
      title: 'Calendario Sidebar',
      description: 'Cadastre eventos por data e sede',
      icon: <CalendarDays size={36} />
    },
    {
      id: 'falaAlpes' as const,
      title: 'Fala Alpes',
      description: 'Defina o video do YouTube exibido na pagina Fala Alpes',
      icon: <Youtube size={36} />
    },
    {
      id: 'setores' as const,
      title: 'Ordem dos Setores',
      description: 'Defina a ordem dos setores na pagina Nossa Equipe',
      icon: <ListOrdered size={36} />
    },
    {
      id: 'sobre' as const,
      title: 'Sobre a Empresa',
      description: 'Video de fundo da abertura da pagina Sobre a Empresa',
      icon: <Clapperboard size={36} />
    },
    {
      id: 'campanhas' as const,
      title: 'Campanhas de Foto',
      description: 'Fotos tematicas por periodo (Dia das Criancas, Natal...)',
      icon: <PartyPopper size={36} />
    },
    {
      id: 'tema' as const,
      title: 'Tema da Intranet',
      description: 'Enfeites de Halloween e Natal para todos (automatico pela data)',
      icon: <Sparkles size={36} />
    }
  ];

  function applyEventos(events: EventoIntranet[]) {
    setEventos(
      (events || []).map((item) => ({
        ...item,
        data_evento: toDateTimeLocalValue(item.data_evento),
        sede_alvo: (item.sede_alvo || 'todas') as SedeAlvo
      }))
    );
  }

  // Recarrega so os eventos para nao desmontar o modal (loadAll mostra o "Carregando").
  async function reloadEventos() {
    applyEventos(await legacyGetJson<EventoIntranet[]>('/api/admin/intranet/eventos'));
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [config, events, setoresOrdem] = await Promise.all([
        legacyGetJson<IntranetConfig>('/api/admin/intranet/config'),
        legacyGetJson<EventoIntranet[]>('/api/admin/intranet/eventos'),
        // Falha aqui nao deve derrubar o resto do painel.
        legacyGetJson<SetorOrdem[]>('/api/admin/intranet/setores-ordem').catch(() => [])
      ]);

      setSetores(setoresOrdem || []);
      setHeroUrl(resolveMediaUrl(asText(config.imagem_inicial_url)));
      setFalaAlpesVideoUrl(asText(config.fala_alpes_video_url));
      setSobreVideoUrl(asText(config.sobre_video_url));
      setTemaFestivoModo(config.tema_festivo || 'auto');
      applyEventos(events);
      setForbidden(false);
    } catch (error) {
      if (error instanceof LegacyApiError && error.status === 403) {
        setForbidden(true);
      } else {
        avisar('Falha ao carregar dados do painel.', 'erro');
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

  async function salvarConfig(url = heroUrl) {
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', '/api/admin/intranet/config', {
        imagem_inicial_url: url.trim()
      });
      avisar(url.trim() ? 'Imagem inicial atualizada.' : 'Imagem padrao restaurada.');
      setActiveModal(null);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao salvar imagem inicial.'), 'erro');
    }
  }

  function restaurarHeroPadrao() {
    setHeroUrl('');
    setHeroDims(null);
    salvarConfig('');
  }

  async function salvarFalaAlpesVideo() {
    const trimmed = falaAlpesVideoUrl.trim();
    if (trimmed && !getYoutubeEmbedUrl(trimmed)) {
      avisar('Informe um link valido do YouTube.', 'erro');
      return;
    }
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', '/api/admin/intranet/config', {
        fala_alpes_video_url: trimmed
      });
      avisar('Video do Fala Alpes atualizado. Uma notificacao foi enviada aos colaboradores.');
      setActiveModal(null);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao salvar o video.'), 'erro');
    }
  }

  async function enviarHeroArquivo(file: File) {
    const problema = validarImagemUpload(file);
    if (problema) {
      avisar(problema, 'erro');
      return;
    }
    try {
      setUploading(true);
      const url = await uploadImageFile(file, 'intranet/hero');
      setHeroUrl(url);
      avisar('Imagem enviada. Confira a previa e clique em "Salvar imagem" para publicar.', 'info');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao enviar imagem.'), 'erro');
    } finally {
      setUploading(false);
    }
  }

  async function salvarTemaFestivo(modo: TemaFestivoModo) {
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', '/api/admin/intranet/config', {
        tema_festivo: modo
      });
      setTemaFestivoModo(modo);
      await recarregarTemaFestivo();
      avisar('Tema da intranet atualizado.');
      setActiveModal(null);
      return true;
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao salvar o tema.'), 'erro');
      return false;
    }
  }

  async function salvarSobreVideo(url = sobreVideoUrl) {
    const trimmed = url.trim();
    if (trimmed && !getYoutubeEmbedUrl(trimmed) && !/\.(mp4|webm)(\?.*)?$/i.test(trimmed)) {
      avisar('Use um link do YouTube ou de um arquivo de video .mp4/.webm.', 'erro');
      return;
    }
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', '/api/admin/intranet/config', {
        sobre_video_url: trimmed
      });
      setSobreVideoUrl(trimmed);
      avisar(
        trimmed
          ? 'Video de fundo atualizado.'
          : 'Video removido. A abertura volta a mostrar a imagem da montanha.'
      );
      setActiveModal(null);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao salvar o video.'), 'erro');
    }
  }

  async function uploadHeroImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await enviarHeroArquivo(file);
  }

  function soltarHeroImagem(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setHeroDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) enviarHeroArquivo(file);
  }

  async function criarNoticia(event: FormEvent) {
    event.preventDefault();
    try {
      await legacyMutateJson<{ success: boolean }>('POST', '/api/admin/intranet/noticias', {
        ...novaNoticia,
        ativo: novaNoticia.ativo
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
      await loadAll();
      avisar('Noticia criada com sucesso.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao criar noticia.'), 'erro');
    }
  }

  async function uploadNovaNoticiaImagem(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImageFile(file, 'intranet/noticias');
      setNovaNoticia((prev) => ({ ...prev, imagem_destaque_url: url }));
      avisar('Imagem da noticia enviada.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao enviar imagem da noticia.'), 'erro');
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
      avisar('Imagem atualizada na noticia. Clique em "Salvar".', 'info');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao enviar imagem.'), 'erro');
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
      avisar('Noticia atualizada.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao atualizar noticia.'), 'erro');
    }
  }

  async function excluirNoticia(id: number) {
    if (!window.confirm('Excluir esta noticia?')) return;
    try {
      await legacyMutateJson<{ success: boolean }>('DELETE', `/api/admin/intranet/noticias/${id}`);
      setNoticias((prev) => prev.filter((item) => item.id !== id));
      avisar('Noticia removida.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao excluir noticia.'), 'erro');
    }
  }

  async function criarEvento(evento: NovoEventoIntranet) {
    try {
      await legacyMutateJson<{ success: boolean }>('POST', '/api/admin/intranet/eventos', {
        ...evento,
        ativo: Boolean(evento.ativo)
      });
      await reloadEventos();
      avisar('Evento criado com sucesso.');
      return true;
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao criar evento.'), 'erro');
      return false;
    }
  }

  async function salvarEvento(item: EventoIntranet) {
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', `/api/admin/intranet/eventos/${item.id}`, {
        ...item,
        ativo: Boolean(item.ativo)
      });
      await reloadEventos();
      avisar('Evento atualizado.');
      return true;
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao atualizar evento.'), 'erro');
      return false;
    }
  }

  async function excluirEvento(id: number) {
    if (!window.confirm('Excluir este evento?')) return false;
    try {
      await legacyMutateJson<{ success: boolean }>('DELETE', `/api/admin/intranet/eventos/${id}`);
      setEventos((prev) => prev.filter((item) => item.id !== id));
      avisar('Evento removido.');
      return true;
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao excluir evento.'), 'erro');
      return false;
    }
  }

  function moverSetor(index: number, direcao: -1 | 1) {
    setSetores((prev) => {
      const destino = index + direcao;
      if (destino < 0 || destino >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[destino]] = [next[destino], next[index]];
      return next;
    });
  }

  async function salvarOrdemSetores() {
    try {
      await legacyMutateJson<{ success: boolean }>('PUT', '/api/admin/intranet/setores-ordem', {
        setores: setores.map((item) => item.setor)
      });
      setSetores((prev) => prev.map((item) => ({ ...item, configurado: true })));
      avisar('Ordem dos setores atualizada.');
      setActiveModal(null);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao salvar ordem dos setores.'), 'erro');
    }
  }

  function renderSetoresContent() {
    return (
      <div className="admin-block">
        <h3>Ordem dos setores - Nossa Equipe</h3>
        <small>
          Use as setas para definir a ordem. Setores marcados como "novo" ainda nao tinham posicao e
          aparecem no final ate voce salvar.
        </small>
        <ol className="admin-order-list">
          {setores.map((item, index) => (
            <li className="admin-order-row" key={item.setor}>
              <span className="admin-order-pos">{index + 1}</span>
              <span className="admin-order-name">
                {item.setor}
                {!item.configurado ? <em className="admin-order-new">novo</em> : null}
              </span>
              <button
                type="button"
                className="admin-icon-btn"
                aria-label={`Subir ${item.setor}`}
                disabled={index === 0}
                onClick={() => moverSetor(index, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="admin-icon-btn"
                aria-label={`Descer ${item.setor}`}
                disabled={index === setores.length - 1}
                onClick={() => moverSetor(index, 1)}
              >
                <ArrowDown size={16} />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="admin-btn primary"
          onClick={salvarOrdemSetores}
          disabled={!setores.length}
        >
          Salvar ordem
        </button>
      </div>
    );
  }

  function renderImagemContent() {
    const previewSrc = heroUrl.trim() ? resolveMediaUrl(heroUrl.trim()) : defaultHeroImage;
    const previewBg = { backgroundImage: `url('${previewSrc}')` };
    const avisos: string[] = [];
    if (heroUrl.trim() && heroDims) {
      const ratio = heroDims.largura / heroDims.altura;
      if (heroDims.largura < HERO_LARGURA_MINIMA) {
        avisos.push(
          `A imagem tem ${heroDims.largura}px de largura; em telas grandes pode ficar borrada. Use pelo menos ${HERO_LARGURA_MINIMA}px.`
        );
      }
      if (ratio < 2 || ratio > 3.6) {
        avisos.push(
          `Proporcao ${ratio.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}:1, diferente da recomendada (8:3). Parte da imagem sera cortada; confira os recortes abaixo.`
        );
      }
    }

    return (
      <div className="admin-block hero-admin">
        <h3>Imagem inicial do Dashboard</h3>

        <div className="hero-guia">
          <p>
            <strong>
              Tamanho recomendado: {HERO_RECOMENDADO.largura} × {HERO_RECOMENDADO.altura} px
            </strong>{' '}
            (proporcao 8:3, horizontal)
          </p>
          <ul>
            <li>Minimo de {HERO_LARGURA_MINIMA} px de largura para nao ficar borrada.</li>
            <li>JPG, PNG ou WEBP, ate 5 MB.</li>
            <li>
              A imagem e recortada para preencher a faixa: 450 px de altura no computador e 240 px
              em telas menores. Deixe textos, logos e rostos dentro da <b>area segura</b> central
              (~1000 × 500 px), marcada na previa.
            </li>
          </ul>
        </div>

        <div className="hero-preview" style={previewBg}>
          <div className="hero-safe">
            <span>Area segura</span>
          </div>
          {!heroUrl.trim() ? <span className="hero-tag">Imagem padrao</span> : null}
        </div>
        {heroUrl.trim() ? (
          <img
            src={previewSrc}
            alt=""
            hidden
            onLoad={(e) =>
              setHeroDims({
                largura: e.currentTarget.naturalWidth,
                altura: e.currentTarget.naturalHeight
              })
            }
            onError={() => setHeroDims(null)}
          />
        ) : null}
        {heroUrl.trim() && heroDims ? (
          <p className="hero-meta">
            Imagem atual: {heroDims.largura} × {heroDims.altura} px
          </p>
        ) : null}
        {avisos.map((aviso) => (
          <p className="hero-aviso" key={aviso}>
            <AlertTriangle size={16} /> {aviso}
          </p>
        ))}

        <div className="hero-recortes">
          {HERO_RECORTES.map((recorte) => (
            <figure key={recorte.label}>
              <div className="hero-recorte" style={{ ...previewBg, aspectRatio: String(recorte.ratio) }} />
              <figcaption>{recorte.label}</figcaption>
            </figure>
          ))}
        </div>

        <label
          className={`hero-drop${heroDragOver ? ' is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setHeroDragOver(true);
          }}
          onDragLeave={() => setHeroDragOver(false)}
          onDrop={soltarHeroImagem}
        >
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadHeroImage} />
          <UploadCloud size={28} />
          <span>
            <strong>Clique para escolher</strong> ou arraste a imagem aqui
          </span>
          <small>JPG, PNG ou WEBP · ate 5 MB · ideal 1920 × 720 px</small>
        </label>
        {uploading ? <small className="hero-meta">Enviando imagem...</small> : null}

        <label className="agenda-field">
          <span>Ou cole a URL de uma imagem</span>
          <input
            placeholder="https://..."
            value={heroUrl}
            onChange={(e) => setHeroUrl(e.target.value)}
          />
        </label>

        <div className="agenda-form-actions">
          <button
            type="button"
            className="admin-btn secondary"
            onClick={restaurarHeroPadrao}
            disabled={!heroUrl.trim()}
          >
            Usar imagem padrao
          </button>
          <button
            type="button"
            className="admin-btn primary"
            onClick={() => salvarConfig()}
            disabled={uploading}
          >
            Salvar imagem
          </button>
        </div>
      </div>
    );
  }

  function renderSobreContent() {
    return (
      <div className="admin-block">
        <h3>Video de fundo - Sobre a Empresa</h3>
        <div className="hero-guia">
          <p>
            <strong>O video roda sem som, em loop e sem controles</strong> atras do titulo "Nosso
            DNA", com uma camada escura por cima para o texto continuar legivel.
          </p>
          <ul>
            <li>
              Link do YouTube (pode ser <b>nao listado</b>) ou de um arquivo <b>.mp4/.webm</b>{' '}
              hospedado.
            </li>
            <li>Prefira videos horizontais (16:9), de 15 a 60 segundos, sem texto importante nas bordas.</li>
            <li>Sem video, ou para quem ativou "reduzir movimento" no sistema, aparece a imagem da montanha.</li>
          </ul>
        </div>

        <div className="sobre-video-previa">
          <VideoFundo url={sobreVideoUrl} poster={mountainImage} />
          <div className="sobre-video-previa-overlay">
            <strong>Nosso DNA</strong>
            <span>Previa da abertura</span>
          </div>
        </div>

        <label className="agenda-field">
          <span>Link do video</span>
          <input
            placeholder="https://www.youtube.com/watch?v=... ou https://.../video.mp4"
            value={sobreVideoUrl}
            onChange={(e) => setSobreVideoUrl(e.target.value)}
          />
        </label>

        <div className="agenda-form-actions">
          <button
            type="button"
            className="admin-btn secondary"
            onClick={() => salvarSobreVideo('')}
            disabled={!sobreVideoUrl.trim()}
          >
            Remover video
          </button>
          <button type="button" className="admin-btn primary" onClick={() => salvarSobreVideo()}>
            Salvar video
          </button>
        </div>
      </div>
    );
  }

  function renderFalaAlpesContent() {
    const previewUrl = getYoutubeEmbedUrl(falaAlpesVideoUrl);
    return (
      <div className="admin-block">
        <h3>Video do Fala Alpes</h3>
        <label>
          Link do YouTube
          <input
            placeholder="https://www.youtube.com/watch?v=..."
            value={falaAlpesVideoUrl}
            onChange={(e) => setFalaAlpesVideoUrl(e.target.value)}
          />
        </label>
        <small>
          Aceita links no formato watch, youtu.be ou embed. Ao trocar o video, uma notificacao e
          criada automaticamente para os colaboradores.
        </small>
        {previewUrl ? (
          <iframe
            width="100%"
            height="260"
            src={previewUrl}
            title="Previa do video Fala Alpes"
            frameBorder="0"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : null}
        <button type="button" onClick={salvarFalaAlpesVideo}>Salvar video</button>
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
          <input placeholder="Inicio de exibicao" type="datetime-local" value={novaNoticia.data_inicio} onChange={(e) => setNovaNoticia((p) => ({ ...p, data_inicio: e.target.value }))} />
          <input placeholder="Fim de exibicao" type="datetime-local" value={novaNoticia.data_fim} onChange={(e) => setNovaNoticia((p) => ({ ...p, data_fim: e.target.value }))} />
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
            <input placeholder="Inicio de exibicao" type="datetime-local" value={toDateTimeLocalValue(item.data_inicio)} onChange={(e) => setNoticias((prev) => prev.map((n) => (n.id === item.id ? { ...n, data_inicio: e.target.value } : n)))} />
            <input placeholder="Fim de exibicao" type="datetime-local" value={toDateTimeLocalValue(item.data_fim)} onChange={(e) => setNoticias((prev) => prev.map((n) => (n.id === item.id ? { ...n, data_fim: e.target.value } : n)))} />
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

  function renderEventosContent() {
    return (
      <div className="admin-block">
        <h3>Calendario da Sidebar</h3>
        <AdminEventosCalendario
          eventos={eventos}
          onCreate={criarEvento}
          onUpdate={salvarEvento}
          onDelete={excluirEvento}
        />
      </div>
    );
  }

  function renderModalContent() {
    switch (activeModal) {
      case 'imagem':
        return renderImagemContent();
      case 'eventos':
        return renderEventosContent();
      case 'falaAlpes':
        return renderFalaAlpesContent();
      case 'setores':
        return renderSetoresContent();
      case 'sobre':
        return renderSobreContent();
      case 'campanhas':
        return (
          <div className="admin-block">
            <h3>Campanhas de foto</h3>
            <AdminFotoCampanhas avisar={avisar} />
          </div>
        );
      case 'tema':
        return <AdminTemaFestivo modo={temaFestivoModo} onSalvar={salvarTemaFestivo} />;
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
      </div>

      <div className="admin-modules-grid">
        {modulos.map((modulo) => (
          <button
            key={modulo.id}
            onClick={() => {
              setActiveModal(modulo.id);
            }}
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
            <div className="admin-modal-body">
              {renderModalContent()}
            </div>
          </div>
        </div>
      ) : null}

      <AvisoFlutuante aviso={aviso} onClose={fecharAviso} />
    </section>
  );
}
