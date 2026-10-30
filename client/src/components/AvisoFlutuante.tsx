import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import '../styles/aviso-flutuante.css';

export type AvisoTipo = 'sucesso' | 'erro' | 'info';

type Aviso = { id: number; tipo: AvisoTipo; mensagem: string };

export function mensagemDeErro(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useAviso() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const avisar = useCallback((mensagem: string, tipo: AvisoTipo = 'sucesso') => {
    setAviso({ id: Date.now(), tipo, mensagem });
  }, []);
  const fecharAviso = useCallback(() => setAviso(null), []);
  return { aviso, avisar, fecharAviso };
}

const ICONES = { sucesso: CheckCircle2, erro: AlertTriangle, info: Info };

// Aviso fixo acima de tudo (inclusive modais): o feedback inline ficava atras do modal ou fora da rolagem.
export function AvisoFlutuante({ aviso, onClose }: { aviso: Aviso | null; onClose: () => void }) {
  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(onClose, aviso.tipo === 'erro' ? 7000 : 4000);
    return () => window.clearTimeout(timer);
  }, [aviso, onClose]);

  if (!aviso) return null;
  const Icone = ICONES[aviso.tipo];

  return (
    <div
      key={aviso.id}
      className={`aviso-flutuante ${aviso.tipo}`}
      role={aviso.tipo === 'erro' ? 'alert' : 'status'}
    >
      <Icone size={20} className="aviso-flutuante-icone" />
      <p>{aviso.mensagem}</p>
      <button type="button" aria-label="Fechar aviso" onClick={onClose}>
        <X size={16} />
      </button>
      <span className="aviso-flutuante-tempo" />
    </div>
  );
}
