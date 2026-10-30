import { useState } from 'react';
import { CalendarClock, Check, Moon as MoonIcon } from 'lucide-react';
import { Bat, Pumpkin } from '../temas/HalloweenTheme';
import { Arvore, Presente } from '../temas/NatalTheme';
import type { TemaFestivoModo } from '../temas/TemaFestivo';
import { useTemaFestivo } from '../temas/TemaFestivo';

type Opcao = {
  modo: TemaFestivoModo;
  titulo: string;
  descricao: string;
  previa: JSX.Element;
  classe: string;
};

const OPCOES: Opcao[] = [
  {
    modo: 'auto',
    titulo: 'Automatico',
    descricao: 'Halloween em outubro e Natal de 1/dez a 6/jan. Fora disso, sem enfeites.',
    previa: <CalendarClock size={34} />,
    classe: 'auto'
  },
  {
    modo: 'halloween',
    titulo: 'Halloween',
    descricao: 'Abobora, morcegos, teias, bruxa voando e cores laranja e roxo.',
    previa: (
      <>
        <Pumpkin className="h-10 w-10" />
        <Bat className="h-4 w-8 text-violet-300" flap={false} />
      </>
    ),
    classe: 'halloween'
  },
  {
    modo: 'natal',
    titulo: 'Natal',
    descricao: 'Pisca-pisca, neve caindo, treno, gorro na logo e cores vermelho e verde.',
    previa: (
      <>
        <Arvore className="h-11 w-9" />
        <Presente className="h-7 w-7" />
      </>
    ),
    classe: 'natal'
  },
  {
    modo: 'nenhum',
    titulo: 'Desligado',
    descricao: 'Visual padrao da intranet, sem enfeites em nenhuma epoca.',
    previa: <MoonIcon size={30} />,
    classe: 'nenhum'
  }
];

const NOME_TEMA = { halloween: 'Halloween', natal: 'Natal' } as const;

type AdminTemaFestivoProps = {
  modo: TemaFestivoModo;
  onSalvar: (modo: TemaFestivoModo) => Promise<boolean>;
};

export function AdminTemaFestivo({ modo, onSalvar }: AdminTemaFestivoProps) {
  const { tema } = useTemaFestivo();
  const [selecionado, setSelecionado] = useState<TemaFestivoModo>(modo);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    await onSalvar(selecionado);
    setSalvando(false);
  }

  return (
    <div className="admin-block">
      <h3>Tema da intranet</h3>
      <p className="tema-festivo-status">
        No ar agora: <strong>{tema ? NOME_TEMA[tema] : 'sem enfeites'}</strong>. Vale para todos os
        colaboradores, inclusive na tela de login. Cada pessoa pode esconder os enfeites no menu do proprio
        nome.
      </p>

      <div className="tema-festivo-opcoes" role="radiogroup" aria-label="Tema da intranet">
        {OPCOES.map((opcao) => {
          const ativo = selecionado === opcao.modo;
          return (
            <button
              key={opcao.modo}
              type="button"
              role="radio"
              aria-checked={ativo}
              className={`tema-festivo-opcao ${opcao.classe}${ativo ? ' ativo' : ''}`}
              onClick={() => setSelecionado(opcao.modo)}
            >
              <span className="tema-festivo-previa" aria-hidden="true">
                {opcao.previa}
              </span>
              <strong>{opcao.titulo}</strong>
              <small>{opcao.descricao}</small>
              {ativo ? (
                <span className="tema-festivo-check" aria-hidden="true">
                  <Check size={14} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="tema-festivo-acoes">
        <button
          type="button"
          className="admin-btn primary"
          onClick={salvar}
          disabled={salvando || selecionado === modo}
        >
          {salvando ? 'Salvando...' : 'Salvar tema'}
        </button>
      </div>
    </div>
  );
}
