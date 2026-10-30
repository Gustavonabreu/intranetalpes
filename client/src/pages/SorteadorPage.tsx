import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, Gift, History, PartyPopper, RotateCcw, Search, Trophy, Users } from 'lucide-react';
import { legacyGetJson, legacyMutateJson } from '../services/legacyApi';
import { FotoColaborador } from '../components/FotoColaborador';
import { AvisoFlutuante, mensagemDeErro, useAviso } from '../components/AvisoFlutuante';
import '../styles/sorteio.css';

type Participante = {
  id: number;
  nome: string;
  setor: string;
  imagem_url?: string | null;
};

type Funcionario = {
  id?: number;
  nome_formatado?: string;
  setor?: string;
  imagem_url?: string | null;
};

type Sorteio = {
  id: number;
  premio: string;
  participantes_total: number;
  notificado: boolean;
  vencedor: Participante;
  realizado_em?: string;
  realizado_por?: string | null;
  participantes?: { id: number; nome: string; setor: string }[];
};

type Fase = 'selecao' | 'sorteando' | 'resultado';

// Animacao: comeca rapido e desacelera; so para no vencedor quando o servidor ja respondeu.
const PASSO_INICIAL_MS = 60;
const PASSO_FINAL_MS = 420;
const DESACELERACAO = 1.12;

const CONFETES = Array.from({ length: 18 }, (_, index) => ({
  left: `${(index * 53) % 100}%`,
  delay: `${(index % 6) * 0.35}s`,
  duration: `${3.2 + (index % 5) * 0.5}s`,
  color: ['#2563eb', '#22d3ee', '#f59e0b', '#ec4899', '#22c55e'][index % 5]
}));

function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || nome;
}

function formatarDataHora(valor?: string) {
  if (!valor) return '';
  const [data, hora] = valor.split(' ');
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}${hora ? ` as ${hora}` : ''}`;
}

export function SorteadorPage() {
  const [funcionarios, setFuncionarios] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState('');
  const [setor, setSetor] = useState('');
  const [premio, setPremio] = useState('');
  const [notificar, setNotificar] = useState(true);

  const [fase, setFase] = useState<Fase>('selecao');
  const [rolando, setRolando] = useState<Participante | null>(null);
  const [resultado, setResultado] = useState<Sorteio | null>(null);
  const [historico, setHistorico] = useState<Sorteio[]>([]);
  const timerRef = useRef<number | null>(null);
  const { aviso, avisar, fecharAviso } = useAviso();

  async function carregarHistorico() {
    try {
      setHistorico(await legacyGetJson<Sorteio[]>('/api/admin/sorteios'));
    } catch {
      setHistorico([]);
    }
  }

  useEffect(() => {
    let mounted = true;
    legacyGetJson<Funcionario[]>('/api/equipe/')
      .then((data) => {
        if (!mounted) return;
        setFuncionarios(
          (data || [])
            .filter((item) => item.id && item.nome_formatado?.trim())
            .map((item) => ({
              id: Number(item.id),
              nome: String(item.nome_formatado).trim(),
              setor: item.setor || '',
              imagem_url: item.imagem_url
            }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        );
      })
      .catch(() => mounted && setErroCarga('Erro ao carregar colaboradores.'))
      .finally(() => mounted && setLoading(false));
    carregarHistorico();
    return () => {
      mounted = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const setores = useMemo(
    () =>
      Array.from(new Set(funcionarios.map((item) => item.setor).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      ),
    [funcionarios]
  );

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    return funcionarios.filter(
      (item) =>
        (!setor || item.setor === setor) &&
        (!termo || normalizar(`${item.nome} ${item.setor}`).includes(termo))
    );
  }, [funcionarios, busca, setor]);

  const participantes = useMemo(
    () => funcionarios.filter((item) => selecionados.has(item.id)),
    [funcionarios, selecionados]
  );

  const todosVisiveisSelecionados =
    visiveis.length > 0 && visiveis.every((item) => selecionados.has(item.id));

  function alternar(id: number) {
    setSelecionados((atual) => {
      const next = new Set(atual);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarVisiveis() {
    setSelecionados((atual) => {
      const next = new Set(atual);
      visiveis.forEach((item) => (todosVisiveisSelecionados ? next.delete(item.id) : next.add(item.id)));
      return next;
    });
  }

  async function sortear() {
    if (participantes.length < 2) {
      avisar('Selecione pelo menos 2 participantes.', 'erro');
      return;
    }
    if (!premio.trim()) {
      avisar('Informe qual e o premio.', 'erro');
      return;
    }

    const lista = participantes;
    setResultado(null);
    setFase('sorteando');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    let vencedor: Sorteio | null = null;
    let falhou = false;
    legacyMutateJson<{ sorteio: Sorteio }>('POST', '/api/admin/sorteios', {
      premio: premio.trim(),
      participantes: lista.map((item) => item.id),
      notificar
    })
      .then((data) => {
        vencedor = data.sorteio;
      })
      .catch((error) => {
        falhou = true;
        avisar(mensagemDeErro(error, 'Falha ao realizar o sorteio.'), 'erro');
      });

    let passo = PASSO_INICIAL_MS;
    let indice = Math.floor(Math.random() * lista.length);
    function girar() {
      if (falhou) {
        setFase('selecao');
        return;
      }
      if (vencedor && passo >= PASSO_FINAL_MS) {
        const final = vencedor as Sorteio;
        setRolando(lista.find((item) => item.id === final.vencedor.id) || final.vencedor);
        setResultado(final);
        setFase('resultado');
        carregarHistorico();
        return;
      }
      indice = (indice + 1 + Math.floor(Math.random() * Math.max(1, lista.length - 1))) % lista.length;
      setRolando(lista[indice]);
      passo = Math.min(PASSO_FINAL_MS, passo * DESACELERACAO);
      timerRef.current = window.setTimeout(girar, passo);
    }
    girar();
  }

  function novoSorteio(semVencedor: boolean) {
    if (semVencedor && resultado) {
      setSelecionados((atual) => {
        const next = new Set(atual);
        next.delete(resultado.vencedor.id);
        return next;
      });
    }
    setPremio('');
    setResultado(null);
    setRolando(null);
    setFase('selecao');
  }

  function renderSorteando() {
    return (
      <section className="sorteio-palco">
        <p className="sorteio-palco-premio">
          <Gift size={18} /> {premio}
        </p>
        <div className="sorteio-roleta">
          {rolando ? (
            <>
              <FotoColaborador
                key={rolando.id}
                src={rolando.imagem_url || undefined}
                name={rolando.nome}
                className="sorteio-roleta-foto"
                initialsClassName="text-5xl"
              />
              <p className="sorteio-roleta-nome">{rolando.nome}</p>
              <p className="sorteio-roleta-setor">{rolando.setor}</p>
            </>
          ) : null}
        </div>
        <ul className="sorteio-mini-grade" aria-hidden="true">
          {participantes.map((item) => (
            <li key={item.id} className={rolando?.id === item.id ? 'ativo' : ''}>
              <FotoColaborador
                src={item.imagem_url || undefined}
                name={item.nome}
                className="h-full w-full rounded-full"
                initialsClassName="text-[11px]"
              />
            </li>
          ))}
        </ul>
        <p className="sorteio-palco-legenda">Sorteando entre {participantes.length} participantes...</p>
      </section>
    );
  }

  function renderResultado() {
    if (!resultado) return null;
    const vencedor = participantes.find((item) => item.id === resultado.vencedor.id) || resultado.vencedor;
    return (
      <section className="sorteio-palco sorteio-palco-resultado">
        <div className="sorteio-confetes" aria-hidden="true">
          {CONFETES.map((confete, index) => (
            <span
              key={index}
              style={{
                left: confete.left,
                background: confete.color,
                animationDelay: confete.delay,
                animationDuration: confete.duration
              }}
            />
          ))}
        </div>
        <p className="sorteio-palco-premio">
          <Gift size={18} /> {resultado.premio}
        </p>
        <span className="sorteio-trofeu">
          <Trophy size={22} />
        </span>
        <FotoColaborador
          src={vencedor.imagem_url || undefined}
          name={vencedor.nome}
          className="sorteio-vencedor-foto"
          initialsClassName="text-6xl"
        />
        <p className="sorteio-vencedor-rotulo">
          <PartyPopper size={16} /> Vencedor(a)
        </p>
        <p className="sorteio-vencedor-nome">{vencedor.nome}</p>
        <p className="sorteio-roleta-setor">{vencedor.setor}</p>

        <div className="sorteio-selos">
          <span>
            <History size={14} /> Salvo no historico
          </span>
          {resultado.notificado ? (
            <span>
              <Bell size={14} /> Avisado no sino
            </span>
          ) : null}
        </div>

        <div className="sorteio-acoes">
          <button type="button" className="sorteio-btn primario" onClick={() => novoSorteio(true)}>
            <RotateCcw size={16} /> Novo sorteio sem {primeiroNome(vencedor.nome)}
          </button>
          <button type="button" className="sorteio-btn" onClick={() => novoSorteio(false)}>
            Voltar para a selecao
          </button>
        </div>
      </section>
    );
  }

  function renderSelecao() {
    const previa = participantes.slice(0, 14);
    return (
      <div className="sorteio-layout">
        <section className="sorteio-card">
          <div className="sorteio-card-head">
            <p className="sorteio-titulo">
              <Users size={18} /> 1. Participantes
            </p>
            <span className="sorteio-contador">
              {selecionados.size} de {funcionarios.length} selecionados
            </span>
          </div>

          <div className="sorteio-toolbar">
            <label className="sorteio-busca">
              <Search size={15} />
              <input
                placeholder="Buscar colaborador..."
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </label>
            <select value={setor} onChange={(event) => setSetor(event.target.value)} aria-label="Setor">
              <option value="">Todos os setores</option>
              {setores.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button type="button" className="sorteio-btn" onClick={alternarVisiveis} disabled={!visiveis.length}>
              {todosVisiveisSelecionados ? 'Desmarcar' : 'Selecionar'}{' '}
              {busca || setor ? `visiveis (${visiveis.length})` : 'todos'}
            </button>
            <button
              type="button"
              className="sorteio-btn"
              onClick={() => setSelecionados(new Set())}
              disabled={!selecionados.size}
            >
              Limpar
            </button>
          </div>

          {loading ? <p className="sorteio-vazio">Carregando colaboradores...</p> : null}
          {erroCarga ? <p className="sorteio-vazio">{erroCarga}</p> : null}
          {!loading && !erroCarga && !visiveis.length ? (
            <p className="sorteio-vazio">Nenhum colaborador encontrado.</p>
          ) : null}

          <ul className="sorteio-grade">
            {visiveis.map((item) => {
              const marcado = selecionados.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    className={`sorteio-pessoa ${marcado ? 'marcado' : ''}`}
                    onClick={() => alternar(item.id)}
                  >
                    <FotoColaborador
                      src={item.imagem_url || undefined}
                      name={item.nome}
                      className="h-11 w-11 flex-shrink-0 rounded-full"
                      initialsClassName="text-sm"
                    />
                    <span className="sorteio-pessoa-info">
                      <strong title={item.nome}>{item.nome}</strong>
                      <small>{item.setor}</small>
                    </span>
                    <span className="sorteio-pessoa-check">{marcado ? <Check size={14} /> : null}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="sorteio-lateral">
          <section className="sorteio-card">
            <p className="sorteio-titulo">
              <Gift size={18} /> 2. Premio
            </p>
            <input
              className="sorteio-premio"
              placeholder="Ex.: Fone de ouvido Bluetooth"
              maxLength={255}
              value={premio}
              onChange={(event) => setPremio(event.target.value)}
            />
            <label className="sorteio-check">
              <input
                type="checkbox"
                checked={notificar}
                onChange={(event) => setNotificar(event.target.checked)}
              />
              Avisar o resultado no sino de notificações
            </label>

            <div className="sorteio-previa">
              {participantes.length ? (
                <>
                  <div className="sorteio-avatares">
                    {previa.map((item) => (
                      <FotoColaborador
                        key={item.id}
                        src={item.imagem_url || undefined}
                        name={item.nome}
                        className="sorteio-avatar"
                        initialsClassName="text-[10px]"
                      />
                    ))}
                    {participantes.length > previa.length ? (
                      <span className="sorteio-avatar sorteio-avatar-mais">
                        +{participantes.length - previa.length}
                      </span>
                    ) : null}
                  </div>
                  <small>{participantes.length} no sorteio</small>
                </>
              ) : (
                <small>Selecione ao menos 2 participantes.</small>
              )}
            </div>

            <button
              type="button"
              className="sorteio-btn primario sorteio-btn-sortear"
              onClick={sortear}
              disabled={participantes.length < 2 || !premio.trim()}
            >
              <PartyPopper size={18} /> Sortear agora
            </button>
          </section>
        </aside>
      </div>
    );
  }

  return (
    <div className="sorteio-pagina">
      <div className="faixa-titulo">
        <h2>Sorteador de Premios</h2>
      </div>

      {fase === 'selecao' ? renderSelecao() : null}
      {fase === 'sorteando' ? renderSorteando() : null}
      {fase === 'resultado' ? renderResultado() : null}

      <section className="sorteio-card sorteio-historico">
        <p className="sorteio-titulo">
          <History size={18} /> Historico de sorteios
        </p>
        {!historico.length ? <p className="sorteio-vazio">Nenhum sorteio realizado ainda.</p> : null}
        <ul>
          {historico.map((item) => (
            <li key={item.id}>
              <details>
                <summary>
                  <FotoColaborador
                    src={item.vencedor.imagem_url || undefined}
                    name={item.vencedor.nome}
                    className="h-10 w-10 flex-shrink-0 rounded-full"
                    initialsClassName="text-xs"
                  />
                  <span className="sorteio-historico-info">
                    <strong>{item.premio}</strong>
                    <small>
                      <Trophy size={12} /> {item.vencedor.nome}
                      {item.vencedor.setor ? ` · ${item.vencedor.setor}` : ''}
                    </small>
                  </span>
                  <span className="sorteio-historico-meta">
                    <small>{formatarDataHora(item.realizado_em)}</small>
                    <small>
                      {item.participantes_total} participantes
                      {item.realizado_por ? ` · por ${primeiroNome(item.realizado_por)}` : ''}
                    </small>
                    {item.notificado ? (
                      <span className="sorteio-historico-selo">
                        <Bell size={11} /> Notificado
                      </span>
                    ) : null}
                  </span>
                </summary>
                <p className="sorteio-historico-participantes">
                  <strong>Participantes:</strong>{' '}
                  {(item.participantes || []).map((pessoa) => pessoa.nome).join(', ')}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <AvisoFlutuante aviso={aviso} onClose={fecharAviso} />
    </div>
  );
}
