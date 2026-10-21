import { useEffect, useState } from 'react';
import { nextExtensionUrl } from '../services/photoFallback';

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

type Props = {
  src?: string;
  name: string;
  className: string;
  initialsClassName: string;
};

// Foto do colaborador; sem foto (ou com erro) mostra as iniciais em vez do placeholder cinza.
export function FotoColaborador({ src, name, className, initialsClassName }: Props) {
  const [currentSrc, setCurrentSrc] = useState(src || '');
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setCurrentSrc(src || '');
    setFailed(!src);
  }, [src]);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={`Foto de ${name}`}
        className={`${className} flex items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-500 font-black text-white select-none ${initialsClassName}`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={`Foto de ${name}`}
      loading="lazy"
      className={`${className} object-cover object-top`}
      onError={() => {
        const next = nextExtensionUrl(currentSrc);
        if (next) setCurrentSrc(next);
        else setFailed(true);
      }}
    />
  );
}
