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
  // Campanha com "Quem e?": no hover a foto da campanha da lugar a esta (a foto atual).
  revelarSrc?: string | null;
};

// Foto do colaborador; sem foto (ou com erro) mostra as iniciais em vez do placeholder cinza.
export function FotoColaborador({ src, name, className, initialsClassName, revelarSrc }: Props) {
  const [currentSrc, setCurrentSrc] = useState(src || '');
  const [failed, setFailed] = useState(!src);
  const [revelarFalhou, setRevelarFalhou] = useState(false);

  useEffect(() => {
    setCurrentSrc(src || '');
    setFailed(!src);
  }, [src]);

  useEffect(() => setRevelarFalhou(false), [revelarSrc]);

  function trocarExtensao() {
    const next = nextExtensionUrl(currentSrc);
    if (next) setCurrentSrc(next);
    else setFailed(true);
  }

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

  if (revelarSrc && !revelarFalhou) {
    return (
      <div className={`${className} group/foto relative overflow-hidden`} title="Passe o mouse: quem e?">
        <img
          src={currentSrc}
          alt={`Foto de ${name}`}
          loading="lazy"
          className="h-full w-full object-cover object-top transition-opacity duration-500 group-hover/foto:opacity-0"
          onError={trocarExtensao}
        />
        <img
          src={revelarSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-top opacity-0 transition-opacity duration-500 group-hover/foto:opacity-100"
          onError={() => setRevelarFalhou(true)}
        />
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={`Foto de ${name}`}
      loading="lazy"
      className={`${className} object-cover object-top`}
      onError={trocarExtensao}
    />
  );
}
