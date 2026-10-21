import { useEffect, useState } from 'react';
import { getYoutubeVideoId } from '../utils/youtube';
import '../styles/video-fundo.css';

type Props = {
  url?: string | null;
  // Imagem mostrada sem video, enquanto carrega, ou com "reduzir movimento" ativo.
  poster: string;
  className?: string;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

// Video decorativo (sem som, em loop, sem controles) cobrindo o container, como background-size: cover.
export function VideoFundo({ url, poster, className = '' }: Props) {
  const reduced = usePrefersReducedMotion();
  const value = String(url || '').trim();
  const youtubeId = getYoutubeVideoId(value);
  const isArquivo = /\.(mp4|webm)(\?.*)?$/i.test(value);

  if (reduced || (!youtubeId && !isArquivo)) {
    return (
      <div className={`video-fundo ${className}`} aria-hidden="true">
        <img src={poster} alt="" className={`video-fundo-poster${reduced ? '' : ' is-animated'}`} />
      </div>
    );
  }

  if (youtubeId) {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      loop: '1',
      playlist: youtubeId, // necessario para o loop funcionar no embed
      controls: '0',
      disablekb: '1',
      modestbranding: '1',
      playsinline: '1',
      rel: '0',
      iv_load_policy: '3'
    });
    return (
      <div className={`video-fundo ${className}`} aria-hidden="true">
        <img src={poster} alt="" className="video-fundo-poster" />
        <iframe
          className="video-fundo-media video-fundo-youtube"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?${params.toString()}`}
          title="Video de fundo"
          tabIndex={-1}
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      </div>
    );
  }

  return (
    <div className={`video-fundo ${className}`} aria-hidden="true">
      <video
        className="video-fundo-media video-fundo-arquivo"
        src={value}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
    </div>
  );
}
