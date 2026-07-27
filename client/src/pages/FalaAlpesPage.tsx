import { useEffect, useState } from 'react';
import { useNotifications } from '../notifications/NotificationsProvider';
import { legacyGetJson } from '../services/legacyApi';
import { getYoutubeEmbedUrl } from '../utils/youtube';

const DEFAULT_VIDEO_EMBED_URL = 'https://www.youtube.com/embed/7rLiaBXHh5c';

type IntranetConfig = {
  fala_alpes_video_url?: string | null;
};

export function FalaAlpesPage() {
  const { markSectionSeen } = useNotifications();
  const [embedUrl, setEmbedUrl] = useState(DEFAULT_VIDEO_EMBED_URL);

  useEffect(() => {
    markSectionSeen('falaAlpes');
  }, [markSectionSeen]);

  useEffect(() => {
    let mounted = true;
    legacyGetJson<IntranetConfig>('/api/intranet-config')
      .then((config) => {
        if (!mounted) return;
        const configured = getYoutubeEmbedUrl(config?.fala_alpes_video_url);
        if (configured) setEmbedUrl(configured);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="section_notificacoes">
      <div className="content_wrap dashboard_hero">
        <iframe
          width="850"
          height="480"
          src={embedUrl}
          title="Fala Alpes"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </section>
  );
}
