import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import '../styles/voltar-ao-topo.css';

// Aparece depois de rolar um pouco a pagina.
const MOSTRAR_APOS_PX = 400;

export function VoltarAoTopo() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    function aoRolar() {
      setVisivel(window.scrollY > MOSTRAR_APOS_PX);
    }
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  function voltar() {
    const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduzirMovimento ? 'auto' : 'smooth' });
  }

  return (
    <button
      type="button"
      className={`voltar-topo${visivel ? ' visivel' : ''}`}
      onClick={voltar}
      aria-label="Voltar ao topo"
      title="Voltar ao topo"
      tabIndex={visivel ? 0 : -1}
      aria-hidden={!visivel}
    >
      <ArrowUp size={22} />
    </button>
  );
}
