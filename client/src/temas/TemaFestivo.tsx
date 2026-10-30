import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { legacyGetJson } from '../services/legacyApi';
import {
  HalloweenFundo,
  HalloweenHeader,
  HalloweenLoginSaudacao,
  HalloweenLogo,
  HalloweenMenu,
  HalloweenSaudacao
} from './HalloweenTheme';
import { NatalFundo, NatalHeader, NatalLoginSaudacao, NatalLogo, NatalMenu, NatalSaudacao } from './NatalTheme';
import '../styles/tema-festivo.css';

export type TemaFestivo = 'halloween' | 'natal';
export type TemaFestivoModo = 'auto' | 'nenhum' | TemaFestivo;

type TemaFestivoContextValue = {
  // Tema em vigor (escolhido pelo admin ou pela data), mesmo que o usuario tenha escondido.
  tema: TemaFestivo | null;
  // Tema que esta aparecendo agora (null se nao ha tema ou o usuario escondeu).
  temaVisivel: TemaFestivo | null;
  oculto: boolean;
  alternarOculto: () => void;
  recarregar: () => Promise<void>;
};

const TemaFestivoContext = createContext<TemaFestivoContextValue | undefined>(undefined);

// Por tema: quem esconde o Halloween volta a ver os enfeites no Natal.
const ocultoKey = (tema: TemaFestivo) => `alpes:enfeites-ocultos:${tema}`;

function lerOculto(tema: TemaFestivo | null) {
  if (!tema) return false;
  try {
    return localStorage.getItem(ocultoKey(tema)) === '1';
  } catch {
    return false;
  }
}

export function TemaFestivoProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<TemaFestivo | null>(null);
  const [oculto, setOculto] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const data = await legacyGetJson<{ tema?: TemaFestivo | null }>('/api/tema-festivo/');
      const novo = data.tema === 'halloween' || data.tema === 'natal' ? data.tema : null;
      setTema(novo);
      setOculto(lerOculto(novo));
    } catch {
      setTema(null);
    }
  }, []);

  useEffect(() => {
    recarregar();
    // Vira o dia (ex.: 1/dez) sem precisar recarregar a pagina.
    const timer = window.setInterval(recarregar, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [recarregar]);

  const temaVisivel = tema && !oculto ? tema : null;

  useEffect(() => {
    const raiz = document.documentElement;
    if (temaVisivel) raiz.dataset.festive = temaVisivel;
    else delete raiz.dataset.festive;
  }, [temaVisivel]);

  const alternarOculto = useCallback(() => {
    if (!tema) return;
    setOculto((atual) => {
      const proximo = !atual;
      try {
        if (proximo) localStorage.setItem(ocultoKey(tema), '1');
        else localStorage.removeItem(ocultoKey(tema));
      } catch {
        // noop
      }
      return proximo;
    });
  }, [tema]);

  const value = useMemo(
    () => ({ tema, temaVisivel, oculto, alternarOculto, recarregar }),
    [tema, temaVisivel, oculto, alternarOculto, recarregar]
  );

  return <TemaFestivoContext.Provider value={value}>{children}</TemaFestivoContext.Provider>;
}

export function useTemaFestivo() {
  const ctx = useContext(TemaFestivoContext);
  if (!ctx) throw new Error('useTemaFestivo must be used within TemaFestivoProvider');
  return ctx;
}

/* Pontos de encaixe no layout: cada um mostra o enfeite do tema visivel (ou nada). */

export function EnfeiteCabecalho() {
  const { temaVisivel } = useTemaFestivo();
  if (temaVisivel === 'halloween') return <HalloweenHeader />;
  if (temaVisivel === 'natal') return <NatalHeader />;
  return null;
}

export function EnfeiteSaudacao() {
  const { temaVisivel } = useTemaFestivo();
  if (temaVisivel === 'halloween') return <HalloweenSaudacao />;
  if (temaVisivel === 'natal') return <NatalSaudacao />;
  return null;
}

export function EnfeiteLogo() {
  const { temaVisivel } = useTemaFestivo();
  if (temaVisivel === 'halloween') return <HalloweenLogo />;
  if (temaVisivel === 'natal') return <NatalLogo />;
  return null;
}

export function EnfeiteMenu() {
  const { temaVisivel } = useTemaFestivo();
  if (temaVisivel === 'halloween') return <HalloweenMenu />;
  if (temaVisivel === 'natal') return <NatalMenu />;
  return null;
}

export function EnfeiteFundo({ topo }: { topo?: number }) {
  const { temaVisivel } = useTemaFestivo();
  if (temaVisivel === 'halloween') return <HalloweenFundo topo={topo} />;
  if (temaVisivel === 'natal') return <NatalFundo />;
  return null;
}

export function EnfeiteLoginSaudacao() {
  const { temaVisivel } = useTemaFestivo();
  if (temaVisivel === 'halloween') return <HalloweenLoginSaudacao />;
  if (temaVisivel === 'natal') return <NatalLoginSaudacao />;
  return null;
}
