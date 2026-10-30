import { useEffect, useState } from 'react';
import { Clock, LogIn } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import '../styles/sessao.css';

type Props = {
  status: 'ok' | 'expirando' | 'expirada';
  expiraEm: number | null;
  renovando: boolean;
  onContinuar: () => void;
  onEntrarNovamente: () => void;
};

function useMinutosRestantes(expiraEm: number | null, ativo: boolean) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!ativo) return;
    setAgora(Date.now());
    const timer = window.setInterval(() => setAgora(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [ativo]);
  if (!expiraEm) return 0;
  return Math.max(1, Math.ceil((expiraEm - agora) / 60000));
}

export function SessaoAviso({ status, expiraEm, renovando, onContinuar, onEntrarNovamente }: Props) {
  const minutos = useMinutosRestantes(expiraEm, status === 'expirando');
  useBodyScrollLock(status === 'expirada');

  if (status === 'expirando') {
    return (
      <div className="sessao-expirando" role="status">
        <Clock size={20} />
        <p>
          Sua sessao expira em <strong>{minutos} {minutos === 1 ? 'minuto' : 'minutos'}</strong>.
        </p>
        <button type="button" onClick={onContinuar} disabled={renovando}>
          {renovando ? 'Renovando...' : 'Continuar conectado'}
        </button>
      </div>
    );
  }

  if (status === 'expirada') {
    return (
      <div className="sessao-overlay">
        <div
          className="sessao-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="sessao-modal-titulo"
          aria-describedby="sessao-modal-texto"
        >
          <span className="sessao-modal-icone">
            <Clock size={30} />
          </span>
          <p id="sessao-modal-titulo" className="sessao-modal-titulo">
            Sua sessao expirou
          </p>
          <p id="sessao-modal-texto" className="sessao-modal-texto">
            Por seguranca, voce foi desconectado. Entre novamente para continuar de onde parou.
          </p>
          <button type="button" className="sessao-modal-btn" onClick={onEntrarNovamente} autoFocus>
            <LogIn size={18} /> Entrar novamente
          </button>
        </div>
      </div>
    );
  }

  return null;
}
