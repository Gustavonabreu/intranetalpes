import { Outlet, useLocation } from 'react-router-dom';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { WidgetsSidebar } from './WidgetsSidebar';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/nossa-equipe': 'Nossa equipe',
  '/aniversariantes': 'Aniversariantes',
  '/noticias': 'Noticias',
  '/equipamentos': 'Equipamentos',
  '/tecnologias': 'Tecnologias',
  '/fala-alpes': 'Fala Alpes',
  '/ia/chatgpt': 'ChatGPT',
  '/ia/elevenlabs': 'ElevenLabs',
  '/utilitarios/sorteador': 'Sorteador',
  '/admin/intranet': 'Admin Intranet',
  '/empresa' : 'Empresa'
};

export function MainLayout() {
  const location = useLocation();
  const title = routeTitles[location.pathname] || 'Intranet';
  const autoCollapseWidgets = location.pathname === '/nossa-equipe' || location.pathname === '/aniversariantes';
  const isAniversariantesPage = location.pathname === '/aniversariantes';

  return (
    <NotificationsProvider>
      <Header title={title} />

      <div className="intranet-container">
        <Sidebar />
        <main className={`coluna-conteudo${isAniversariantesPage ? ' coluna-conteudo--fit' : ''}`}>
          <Outlet />
        </main>
        <WidgetsSidebar autoCollapse={autoCollapseWidgets} />
      </div>

      <Footer />
    </NotificationsProvider>
  );
}
