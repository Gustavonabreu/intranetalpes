import { useEffect } from 'react';
import { useNotifications } from '../notifications/NotificationsProvider';

export function FalaAlpesPage() {
  const { markSectionSeen } = useNotifications();

  useEffect(() => {
    markSectionSeen('falaAlpes');
  }, [markSectionSeen]);

  return (
    <section className="section_notificacoes">
      <div className="content_wrap dashboard_hero">
        <iframe
          width="850"
          height="480"
          src="https://www.youtube.com/embed/7rLiaBXHh5c"
          title="Fala Alpes"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </section>
  );
}
