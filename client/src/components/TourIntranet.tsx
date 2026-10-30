import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import '../styles/tour.css';

type Lado = 'baixo' | 'cima' | 'direita' | 'esquerda';

type PassoTour = {
  // Valor do atributo data-tour do elemento destacado. Sem alvo = cartao no centro da tela.
  alvo?: string;
  titulo: string;
  texto: string;
  lado?: Lado;
};

// Passos sem o elemento na tela (sem permissao, coluna escondida no celular...) sao pulados.
const PASSOS: PassoTour[] = [
  {
    alvo: 'menu',
    titulo: 'Menu principal',
    texto: 'Por aqui você navega entre as áreas da intranet. Quando aparece uma bolinha no ícone, tem novidade naquela área.',
    lado: 'direita'
  },
  {
    alvo: 'menu-equipe',
    titulo: 'Nossa Equipe',
    texto: 'Encontre qualquer colaborador por nome ou setor, com foto e contato. Passando o mouse você também chega aos Aniversariantes.',
    lado: 'direita'
  },
  {
    alvo: 'menu-noticias',
    titulo: 'Notícias',
    texto: 'Comunicados e novidades da empresa, incluindo os resultados dos sorteios.',
    lado: 'direita'
  },
  {
    alvo: 'menu-empresa',
    titulo: 'Sobre a Empresa',
    texto: 'Missão, visão, valores, nossas sedes e o vídeo institucional do Grupo Alpes.',
    lado: 'direita'
  },
  {
    alvo: 'menu-equipamentos',
    titulo: 'Equipamentos',
    texto: 'Os equipamentos de TI que estão no seu nome.',
    lado: 'direita'
  },
  {
    alvo: 'menu-fala-alpes',
    titulo: 'Fala Alpes',
    texto: 'Os vídeos do Fala Alpes, com os recados e novidades do grupo.',
    lado: 'direita'
  },
  {
    alvo: 'menu-admin',
    titulo: 'Admin Intranet',
    texto: 'Onde você gerencia o conteúdo: imagem da página inicial, notícias, calendário, campanhas de foto e mais.',
    lado: 'direita'
  },
  {
    alvo: 'menu-sorteador',
    titulo: 'Sorteador',
    texto: 'Sorteios entre os colaboradores. O resultado fica salvo no histórico e pode virar notificação para todos.',
    lado: 'direita'
  },
  {
    alvo: 'agenda',
    titulo: 'Calendário da empresa',
    texto: 'Os eventos e datas importantes do mês e, ao lado, os próximos eventos.'
  },
  {
    alvo: 'comunicados',
    titulo: 'Comunicados',
    texto: 'Os avisos em destaque passam aqui automaticamente. Use as setas para navegar entre eles.',
    lado: 'cima'
  },
  {
    alvo: 'widgets',
    titulo: 'Sempre à mão',
    texto: 'Aniversariantes do mês, posts recentes e próximos eventos. A setinha no topo recolhe esta coluna.',
    lado: 'esquerda'
  },
  {
    alvo: 'sistemas',
    titulo: 'Sistemas Alpes',
    texto: 'Acesso rápido aos outros sistemas do grupo: Apex Sistema, Apex BI e Apex Demandas e Projetos.'
  },
  {
    alvo: 'notificacoes',
    titulo: 'Notificações',
    texto: 'O sino mostra quantas novidades você ainda não leu. Clique para ver e marcar como lidas.'
  },
  {
    alvo: 'tema',
    titulo: 'Tema claro ou escuro',
    texto: 'Troque quando quiser. A intranet lembra da sua escolha.'
  },
  {
    alvo: 'tour',
    titulo: 'Reveja quando quiser',
    texto: 'Este botão abre o tour de novo sempre que precisar.'
  },
  {
    alvo: 'perfil',
    titulo: 'Seu perfil',
    texto: 'Clique no seu nome para sair da intranet.'
  }
];

const ESPACO = 14; // distancia entre o destaque e o cartao
const MARGEM = 12; // distancia minima do cartao ate a borda da tela
const FOLGA_DESTAQUE = 6;

function buscarAlvo(alvo: string) {
  const elemento = document.querySelector<HTMLElement>(`[data-tour="${alvo}"]`);
  if (!elemento) return null;
  const rect = elemento.getBoundingClientRect();
  // display:none (ex.: widgets no celular) da retangulo zerado.
  return rect.width > 0 && rect.height > 0 ? elemento : null;
}

function calcularPosicao(alvo: DOMRect, largura: number, altura: number, preferido: Lado = 'baixo') {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cabe: Record<Lado, boolean> = {
    baixo: alvo.bottom + ESPACO + altura <= vh - MARGEM,
    cima: alvo.top - ESPACO - altura >= MARGEM,
    direita: alvo.right + ESPACO + largura <= vw - MARGEM,
    esquerda: alvo.left - ESPACO - largura >= MARGEM
  };
  const ordem: Lado[] = [preferido, 'baixo', 'cima', 'direita', 'esquerda'];
  const lado = ordem.find((item) => cabe[item]) || 'baixo';

  let top: number;
  let left: number;
  if (lado === 'baixo' || lado === 'cima') {
    top = lado === 'baixo' ? alvo.bottom + ESPACO : alvo.top - ESPACO - altura;
    left = alvo.left + alvo.width / 2 - largura / 2;
  } else {
    left = lado === 'direita' ? alvo.right + ESPACO : alvo.left - ESPACO - largura;
    top = alvo.top + alvo.height / 2 - altura / 2;
  }
  return {
    top: Math.min(Math.max(top, MARGEM), Math.max(MARGEM, vh - altura - MARGEM)),
    left: Math.min(Math.max(left, MARGEM), Math.max(MARGEM, vw - largura - MARGEM))
  };
}

type TourIntranetProps = {
  aberto: boolean;
  nomeUsuario?: string;
  onFechar: () => void;
};

export function TourIntranet({ aberto, nomeUsuario, onFechar }: TourIntranetProps) {
  // null = cartao de boas-vindas; depois, indice em `passos`; passos.length = cartao final.
  const [indice, setIndice] = useState<number | null>(null);
  const [passos, setPassos] = useState<PassoTour[]>([]);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const cartaoRef = useRef<HTMLDivElement>(null);
  const botaoPrincipalRef = useRef<HTMLButtonElement>(null);

  const passo = indice !== null && indice < passos.length ? passos[indice] : null;
  const final = indice !== null && indice >= passos.length;

  useEffect(() => {
    if (aberto) {
      setIndice(null);
      setPassos([]);
    }
  }, [aberto]);

  const comecar = useCallback(() => {
    // Filtra na hora de comecar: a pagina ja terminou de montar e o menu ja reflete as permissoes.
    setPassos(PASSOS.filter((item) => !item.alvo || buscarAlvo(item.alvo)));
    setIndice(0);
  }, []);

  const avancar = useCallback(() => {
    if (indice === null) comecar();
    else if (indice >= passos.length) onFechar();
    else setIndice(indice + 1);
  }, [indice, passos.length, comecar, onFechar]);

  const voltar = useCallback(() => {
    if (indice) setIndice(indice - 1);
  }, [indice]);

  // Acompanha o elemento destacado (rolagem, redimensionamento, rolagem suave do scrollIntoView).
  useEffect(() => {
    if (!aberto || !passo?.alvo) {
      setRect(null);
      return;
    }
    const elemento = buscarAlvo(passo.alvo);
    if (!elemento) {
      setRect(null);
      return;
    }
    elemento.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    let frame = 0;
    function medir() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(elemento!.getBoundingClientRect()));
    }
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [aberto, passo]);

  // Posiciona o cartao depois de saber o tamanho real dele.
  useLayoutEffect(() => {
    const cartao = cartaoRef.current;
    if (!aberto || !cartao || !rect) {
      setPosicao(null);
      return;
    }
    setPosicao(calcularPosicao(rect, cartao.offsetWidth, cartao.offsetHeight, passo?.lado));
  }, [aberto, rect, passo]);

  useEffect(() => {
    if (aberto) botaoPrincipalRef.current?.focus({ preventScroll: true });
  }, [aberto, indice]);

  useEffect(() => {
    if (!aberto) return;
    function teclado(event: KeyboardEvent) {
      if (event.key === 'Escape') onFechar();
      else if (event.key === 'ArrowRight') avancar();
      else if (event.key === 'ArrowLeft') voltar();
    }
    window.addEventListener('keydown', teclado);
    return () => window.removeEventListener('keydown', teclado);
  }, [aberto, avancar, voltar, onFechar]);

  if (!aberto) return null;

  const primeiroNome = (nomeUsuario || '').trim().split(/\s+/)[0];
  const destacado = Boolean(passo?.alvo && rect);

  let titulo: string;
  let texto: string;
  if (indice === null) {
    titulo = primeiroNome ? `Olá, ${primeiroNome}! Bem-vindo(a) à intranet` : 'Bem-vindo(a) à intranet';
    texto = 'Em menos de um minuto mostramos onde fica cada coisa. Você pode sair do tour quando quiser.';
  } else if (final) {
    titulo = 'Tudo pronto!';
    texto = 'Agora é com você. Se quiser rever, é só clicar no botão do tour no topo da página.';
  } else {
    titulo = passo!.titulo;
    texto = passo!.texto;
  }

  return (
    <div className="tour-raiz">
      {/* Bloqueia cliques na pagina durante o tour; o escurecimento vem do destaque ou do fundo. */}
      <div className={`tour-bloqueio${destacado ? '' : ' escuro'}`} />
      {destacado && rect ? (
        <div
          className="tour-destaque"
          style={{
            top: rect.top - FOLGA_DESTAQUE,
            left: rect.left - FOLGA_DESTAQUE,
            width: rect.width + FOLGA_DESTAQUE * 2,
            height: rect.height + FOLGA_DESTAQUE * 2
          }}
        />
      ) : null}

      <div
        ref={cartaoRef}
        className={`tour-cartao${destacado ? '' : ' centro'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        aria-describedby="tour-texto"
        style={destacado ? { top: posicao?.top ?? -9999, left: posicao?.left ?? -9999 } : undefined}
      >
        <button type="button" className="tour-fechar" aria-label="Fechar tour" onClick={onFechar}>
          <X size={16} />
        </button>

        {indice === null || final ? (
          <span className="tour-icone">
            <Compass size={22} />
          </span>
        ) : (
          <span className="tour-etapa">
            {indice + 1} de {passos.length}
          </span>
        )}

        <h2 id="tour-titulo" className="tour-titulo">
          {titulo}
        </h2>
        <p id="tour-texto" className="tour-texto">
          {texto}
        </p>

        {passo ? (
          <div className="tour-progresso" aria-hidden="true">
            {passos.map((item, posicaoPasso) => (
              <span key={item.alvo || posicaoPasso} className={posicaoPasso <= indice! ? 'feito' : ''} />
            ))}
          </div>
        ) : null}

        <div className="tour-acoes">
          {indice === null ? (
            <button type="button" className="tour-btn" onClick={onFechar}>
              Agora não
            </button>
          ) : passo && indice > 0 ? (
            <button type="button" className="tour-btn" onClick={voltar}>
              <ArrowLeft size={15} /> Voltar
            </button>
          ) : (
            <span />
          )}
          <button ref={botaoPrincipalRef} type="button" className="tour-btn primario" onClick={avancar}>
            {indice === null ? (
              <>
                Começar tour <ArrowRight size={15} />
              </>
            ) : final ? (
              'Concluir'
            ) : indice === passos.length - 1 ? (
              'Finalizar'
            ) : (
              <>
                Próximo <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
