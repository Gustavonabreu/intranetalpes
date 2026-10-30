import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { legacyGetJson, legacyMutateJson } from '../services/legacyApi';
import { validarImagemUpload } from '../utils/imagemUpload';
import { FOTO_CAMPANHA_TEMAS, FotoCampanhaTema, temaFotoCampanha } from '../config/fotoCampanhas';
import { FotoColaborador } from './FotoColaborador';
import { AvisoTipo, mensagemDeErro } from './AvisoFlutuante';

type Campanha = {
  id: number;
  nome: string;
  tema: FotoCampanhaTema;
  data_inicio: string;
  data_fim: string;
  revelar: number;
  ativo: number;
  total_fotos: number;
};

type FotoColaboradorCampanha = {
  funcionario_id: number;
  nome: string;
  setor: string;
  imagem_oficial_url: string | null;
  imagem_campanha_url: string | null;
};

type CampanhaForm = {
  nome: string;
  tema: FotoCampanhaTema;
  data_inicio: string;
  data_fim: string;
  revelar: boolean;
  ativo: boolean;
};

type Filtro = 'todos' | 'sem' | 'com';

const FORM_VAZIO: CampanhaForm = {
  nome: '',
  tema: 'criancas',
  data_inicio: '',
  data_fim: '',
  revelar: true,
  ativo: true
};

const STATUS = {
  'no-ar': 'No ar',
  agendada: 'Agendada',
  encerrada: 'Encerrada',
  desativada: 'Desativada'
};

function statusCampanha(campanha: Campanha, hoje: string): keyof typeof STATUS {
  if (!Number(campanha.ativo)) return 'desativada';
  if (hoje < campanha.data_inicio) return 'agendada';
  if (hoje > campanha.data_fim) return 'encerrada';
  return 'no-ar';
}

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export function AdminFotoCampanhas({
  avisar
}: {
  avisar: (mensagem: string, tipo?: AvisoTipo) => void;
}) {
  const [hoje, setHoje] = useState('');
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [selecionadaId, setSelecionadaId] = useState<number | null>(null);
  // null = sem formulario; 0 = nova campanha; id = editando.
  const [formId, setFormId] = useState<number | null>(null);
  const [form, setForm] = useState<CampanhaForm>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const [fotos, setFotos] = useState<FotoColaboradorCampanha[]>([]);
  const [carregandoFotos, setCarregandoFotos] = useState(false);
  const [enviando, setEnviando] = useState<Set<number>>(new Set());
  const [arrastandoId, setArrastandoId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');

  const selecionada = campanhas.find((campanha) => campanha.id === selecionadaId) || null;

  async function carregarCampanhas(selecionar?: number) {
    try {
      const data = await legacyGetJson<{ hoje: string; campanhas: Campanha[] }>(
        '/api/admin/intranet/foto-campanhas'
      );
      setHoje(data.hoje);
      setCampanhas(data.campanhas || []);
      if (selecionar) setSelecionadaId(selecionar);
      else if (!selecionadaId && data.campanhas?.length) setSelecionadaId(data.campanhas[0].id);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao carregar campanhas.'), 'erro');
    }
  }

  useEffect(() => {
    carregarCampanhas();
  }, []);

  useEffect(() => {
    if (!selecionadaId) {
      setFotos([]);
      return;
    }
    let ativo = true;
    setCarregandoFotos(true);
    legacyGetJson<FotoColaboradorCampanha[]>(`/api/admin/intranet/foto-campanhas/${selecionadaId}/fotos`)
      .then((data) => ativo && setFotos(data || []))
      .catch((error) => ativo && avisar(mensagemDeErro(error, 'Falha ao carregar fotos.'), 'erro'))
      .finally(() => ativo && setCarregandoFotos(false));
    return () => {
      ativo = false;
    };
  }, [selecionadaId]);

  const fotosFiltradas = useMemo(() => {
    const termo = busca
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    return fotos.filter((item) => {
      if (filtro === 'com' && !item.imagem_campanha_url) return false;
      if (filtro === 'sem' && item.imagem_campanha_url) return false;
      if (!termo) return true;
      return `${item.nome} ${item.setor}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .includes(termo);
    });
  }, [fotos, filtro, busca]);

  const totalComFoto = fotos.filter((item) => item.imagem_campanha_url).length;

  function abrirNova() {
    setForm({ ...FORM_VAZIO, nome: `${temaFotoCampanha('criancas').label} ${new Date().getFullYear()}` });
    setFormId(0);
  }

  function abrirEdicao(campanha: Campanha) {
    setForm({
      nome: campanha.nome,
      tema: campanha.tema,
      data_inicio: campanha.data_inicio,
      data_fim: campanha.data_fim,
      revelar: Boolean(Number(campanha.revelar)),
      ativo: Boolean(Number(campanha.ativo))
    });
    setFormId(campanha.id);
  }

  function escolherTema(tema: FotoCampanhaTema) {
    setForm((prev) => {
      // Nome sugerido acompanha o tema enquanto o admin nao escrever outro.
      const sugeridoAnterior = `${temaFotoCampanha(prev.tema).label} ${new Date().getFullYear()}`;
      const nome =
        !prev.nome || prev.nome === sugeridoAnterior
          ? `${temaFotoCampanha(tema).label} ${new Date().getFullYear()}`
          : prev.nome;
      return { ...prev, tema, nome };
    });
  }

  async function salvarCampanha(event: FormEvent) {
    event.preventDefault();
    if (form.data_fim < form.data_inicio) {
      avisar('A data de fim deve ser igual ou posterior ao inicio.', 'erro');
      return;
    }
    setSalvando(true);
    try {
      if (formId) {
        await legacyMutateJson('PUT', `/api/admin/intranet/foto-campanhas/${formId}`, form);
        await carregarCampanhas(formId);
        avisar('Campanha atualizada.');
      } else {
        const result = await legacyMutateJson<{ id: number }>(
          'POST',
          '/api/admin/intranet/foto-campanhas',
          form
        );
        await carregarCampanhas(result.id);
        avisar('Campanha criada. Agora envie as fotos dos colaboradores.');
      }
      setFormId(null);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao salvar campanha.'), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function duplicarCampanha(campanha: Campanha) {
    try {
      const result = await legacyMutateJson<{ id: number }>(
        'POST',
        `/api/admin/intranet/foto-campanhas/${campanha.id}/duplicar`
      );
      await carregarCampanhas(result.id);
      avisar('Campanha copiada para o ano seguinte, com as mesmas fotos. Confira as datas.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao duplicar campanha.'), 'erro');
    }
  }

  async function excluirCampanha(campanha: Campanha) {
    if (!window.confirm(`Excluir a campanha "${campanha.nome}" e as fotos enviadas nela?`)) return;
    try {
      await legacyMutateJson('DELETE', `/api/admin/intranet/foto-campanhas/${campanha.id}`);
      if (selecionadaId === campanha.id) setSelecionadaId(null);
      if (formId === campanha.id) setFormId(null);
      await carregarCampanhas();
      avisar('Campanha excluida.');
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao excluir campanha.'), 'erro');
    }
  }

  function atualizarFoto(funcionarioId: number, url: string | null) {
    setFotos((prev) =>
      prev.map((item) =>
        item.funcionario_id === funcionarioId ? { ...item, imagem_campanha_url: url } : item
      )
    );
    setCampanhas((prev) =>
      prev.map((campanha) => {
        if (campanha.id !== selecionadaId) return campanha;
        const tinha = fotos.find((item) => item.funcionario_id === funcionarioId)?.imagem_campanha_url;
        const delta = url && !tinha ? 1 : !url && tinha ? -1 : 0;
        return { ...campanha, total_fotos: Number(campanha.total_fotos) + delta };
      })
    );
  }

  async function enviarFoto(item: FotoColaboradorCampanha, file: File) {
    const problema = validarImagemUpload(file);
    if (problema) {
      avisar(problema, 'erro');
      return;
    }
    setEnviando((prev) => new Set(prev).add(item.funcionario_id));
    try {
      const result = await legacyMutateJson<{ imagem_campanha_url: string }>(
        'PUT',
        `/api/admin/intranet/foto-campanhas/${selecionadaId}/fotos/${item.funcionario_id}`,
        { data_url: await fileToDataUrl(file) }
      );
      atualizarFoto(item.funcionario_id, result.imagem_campanha_url);
      avisar(`Foto de ${item.nome} salva.`);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao enviar foto.'), 'erro');
    } finally {
      setEnviando((prev) => {
        const next = new Set(prev);
        next.delete(item.funcionario_id);
        return next;
      });
    }
  }

  async function removerFoto(item: FotoColaboradorCampanha) {
    try {
      await legacyMutateJson(
        'DELETE',
        `/api/admin/intranet/foto-campanhas/${selecionadaId}/fotos/${item.funcionario_id}`
      );
      atualizarFoto(item.funcionario_id, null);
      avisar(`Foto de ${item.nome} removida da campanha.`);
    } catch (error) {
      avisar(mensagemDeErro(error, 'Falha ao remover foto.'), 'erro');
    }
  }

  function escolherArquivo(item: FotoColaboradorCampanha, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) enviarFoto(item, file);
  }

  function soltarArquivo(item: FotoColaboradorCampanha, event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setArrastandoId(null);
    const file = event.dataTransfer.files?.[0];
    if (file) enviarFoto(item, file);
  }

  function renderForm() {
    const tema = temaFotoCampanha(form.tema);
    return (
      <form className="agenda-form" onSubmit={salvarCampanha}>
        <div className="agenda-form-head">
          <h5>{formId ? 'Editar campanha' : 'Nova campanha'}</h5>
          <span>
            {tema.emoji} {tema.label}
          </span>
        </div>

        <div className="campanha-temas" role="radiogroup" aria-label="Tema">
          {FOTO_CAMPANHA_TEMAS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={form.tema === item.id}
              className={`campanha-tema ${form.tema === item.id ? 'ativo' : ''}`}
              onClick={() => escolherTema(item.id)}
            >
              <span aria-hidden="true">{item.emoji}</span>
              {item.label}
            </button>
          ))}
        </div>

        <label className="agenda-field">
          <span>Nome</span>
          <input
            value={form.nome}
            maxLength={120}
            required
            onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
          />
        </label>

        <div className="campanha-datas">
          <label className="agenda-field">
            <span>Comeca em</span>
            <input
              type="date"
              required
              value={form.data_inicio}
              onChange={(event) => setForm((prev) => ({ ...prev, data_inicio: event.target.value }))}
            />
          </label>
          <label className="agenda-field">
            <span>
              Termina em <em>(inclusive)</em>
            </span>
            <input
              type="date"
              required
              min={form.data_inicio || undefined}
              value={form.data_fim}
              onChange={(event) => setForm((prev) => ({ ...prev, data_fim: event.target.value }))}
            />
          </label>
        </div>

        <div className="agenda-checks">
          <label className="check">
            <input
              type="checkbox"
              checked={form.revelar}
              onChange={(event) => setForm((prev) => ({ ...prev, revelar: event.target.checked }))}
            />
            "Quem e?": mostrar a foto atual ao passar o mouse
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(event) => setForm((prev) => ({ ...prev, ativo: event.target.checked }))}
            />
            Ativa
          </label>
        </div>

        <small className="agenda-hint">
          No periodo, a foto da campanha substitui a oficial na Nossa Equipe, nos Aniversariantes e no
          widget. Quem nao tiver foto enviada continua com a oficial. Depois da data de fim tudo volta
          sozinho.
        </small>

        <div className="agenda-form-actions">
          <button type="button" className="admin-btn secondary" onClick={() => setFormId(null)}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn primary" disabled={salvando}>
            {salvando ? 'Salvando...' : formId ? 'Salvar alteracoes' : 'Criar campanha'}
          </button>
        </div>
      </form>
    );
  }

  function renderFotos() {
    if (!selecionada) {
      return (
        <div className="agenda-empty">
          Crie uma campanha (ex.: Dia das Criancas) e envie as fotos tematicas dos colaboradores.
        </div>
      );
    }

    const tema = temaFotoCampanha(selecionada.tema);
    const status = statusCampanha(selecionada, hoje);
    const progresso = fotos.length ? Math.round((totalComFoto / fotos.length) * 100) : 0;

    return (
      <>
        <div className="campanha-detalhe-head">
          <div>
            <h4>
              <span aria-hidden="true">{tema.emoji}</span> {selecionada.nome}
            </h4>
            <p>
              {formatarData(selecionada.data_inicio)} a {formatarData(selecionada.data_fim)}
              <span className={`campanha-status ${status}`}>{STATUS[status]}</span>
            </p>
          </div>
          <button type="button" className="admin-btn secondary" onClick={() => abrirEdicao(selecionada)}>
            <Pencil size={14} /> Editar
          </button>
        </div>

        <div className="campanha-progresso">
          <div className="campanha-progresso-barra">
            <span style={{ width: `${progresso}%` }} />
          </div>
          <small>
            {totalComFoto} de {fotos.length} colaboradores com foto
          </small>
        </div>

        <div className="campanha-filtros">
          <label className="campanha-busca">
            <Search size={15} />
            <input
              placeholder="Buscar colaborador ou setor"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
          </label>
          <div className="campanha-filtro-tabs">
            {(
              [
                ['todos', 'Todos'],
                ['sem', 'Sem foto'],
                ['com', 'Com foto']
              ] as [Filtro, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filtro === id ? 'ativo' : ''}
                onClick={() => setFiltro(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {carregandoFotos ? <p className="agenda-hint">Carregando colaboradores...</p> : null}
        {!carregandoFotos && !fotosFiltradas.length ? (
          <div className="agenda-empty">Nenhum colaborador neste filtro.</div>
        ) : null}

        <ul className="campanha-fotos">
          {fotosFiltradas.map((item) => {
            const carregando = enviando.has(item.funcionario_id);
            return (
              <li key={item.funcionario_id} className="campanha-foto">
                <label
                  className={`campanha-foto-slot ${item.imagem_campanha_url ? 'tem-foto' : ''} ${
                    arrastandoId === item.funcionario_id ? 'arrastando' : ''
                  }`}
                  title={item.imagem_campanha_url ? 'Trocar foto' : 'Enviar foto'}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setArrastandoId(item.funcionario_id);
                  }}
                  onDragLeave={() => setArrastandoId(null)}
                  onDrop={(event) => soltarArquivo(item, event)}
                >
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    disabled={carregando}
                    onChange={(event) => escolherArquivo(item, event)}
                  />
                  {item.imagem_campanha_url ? (
                    <>
                      <img src={item.imagem_campanha_url} alt={`Foto de campanha de ${item.nome}`} />
                      <span className="campanha-foto-trocar">Trocar</span>
                    </>
                  ) : (
                    <span className="campanha-foto-vazia">
                      <UploadCloud size={22} />
                      Enviar foto
                    </span>
                  )}
                  {carregando ? <span className="campanha-foto-enviando">Enviando...</span> : null}
                </label>

                {item.imagem_campanha_url ? (
                  <button
                    type="button"
                    className="campanha-foto-remover"
                    aria-label={`Remover foto de ${item.nome}`}
                    onClick={() => removerFoto(item)}
                  >
                    <X size={14} />
                  </button>
                ) : null}

                <div className="campanha-foto-info">
                  <FotoColaborador
                    src={item.imagem_oficial_url || undefined}
                    name={item.nome}
                    className="h-7 w-7 flex-shrink-0 rounded-full"
                    initialsClassName="text-[10px]"
                  />
                  <span title={item.nome}>
                    <strong>{item.nome}</strong>
                    <small>{item.setor}</small>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <div className="campanhas-admin">
      <aside className="campanhas-lista">
        <div className="campanhas-lista-head">
          <h4>Campanhas</h4>
          <button type="button" className="admin-btn primary" onClick={abrirNova}>
            <Plus size={14} /> Nova
          </button>
        </div>

        {!campanhas.length ? <div className="agenda-empty">Nenhuma campanha ainda.</div> : null}

        <ul>
          {campanhas.map((campanha) => {
            const tema = temaFotoCampanha(campanha.tema);
            const status = statusCampanha(campanha, hoje);
            return (
              <li key={campanha.id}>
                <button
                  type="button"
                  className={`campanha-item ${selecionadaId === campanha.id ? 'ativo' : ''}`}
                  onClick={() => {
                    setSelecionadaId(campanha.id);
                    setFormId(null);
                  }}
                >
                  <span className="campanha-item-emoji" aria-hidden="true">
                    {tema.emoji}
                  </span>
                  <span className="campanha-item-info">
                    <strong>{campanha.nome}</strong>
                    <small>
                      {formatarData(campanha.data_inicio)} a {formatarData(campanha.data_fim)} ·{' '}
                      {campanha.total_fotos} {Number(campanha.total_fotos) === 1 ? 'foto' : 'fotos'}
                    </small>
                    <span className={`campanha-status ${status}`}>{STATUS[status]}</span>
                  </span>
                </button>
                <div className="campanha-item-acoes">
                  <button
                    type="button"
                    className="admin-icon-btn"
                    title="Copiar para o ano seguinte"
                    aria-label={`Copiar ${campanha.nome} para o ano seguinte`}
                    onClick={() => duplicarCampanha(campanha)}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    title="Excluir"
                    aria-label={`Excluir ${campanha.nome}`}
                    onClick={() => excluirCampanha(campanha)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="campanhas-detalhe">{formId !== null ? renderForm() : renderFotos()}</section>
    </div>
  );
}
