import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TourIntranet } from './TourIntranet';
import { VoltarAoTopo } from './VoltarAoTopo';
import { EnfeiteFundo } from '../temas/TemaFestivo';
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

// Trocar a versao faz o tour aparecer de novo para todos (ex.: depois de mudar bastante o menu).
const TOUR_VERSAO = 'v1';
const tourVistoKey = (userId: string) => `alpes:tour-visto:${TOUR_VERSAO}:${userId}`;

export function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tourAberto, setTourAberto] = useState(false);
  const title = routeTitles[location.pathname] || 'Intranet';
  const autoCollapseWidgets = location.pathname === '/nossa-equipe' || location.pathname === '/aniversariantes';
  const isAniversariantesPage = location.pathname === '/aniversariantes';
  const userId = user?.id != null ? String(user.id) : '';

  // Primeira visita ao Dashboard: abre o tour sozinho (uma vez por usuario neste navegador).
  useEffect(() => {
    if (!userId || location.pathname !== '/dashboard') return;
    try {
      if (!localStorage.getItem(tourVistoKey(userId))) setTourAberto(true);
    } catch {
      // localStorage indisponivel: nao insiste no tour.
    }
  }, [userId, location.pathname]);

  function abrirTour() {
    // O tour passa pelo calendario e comunicados, que so existem no Dashboard.
    if (location.pathname !== '/dashboard') navigate('/dashboard');
    setTourAberto(true);
  }

  function fecharTour() {
    setTourAberto(false);
    try {
      if (userId) localStorage.setItem(tourVistoKey(userId), new Date().toISOString());
    } catch {
      // noop
    }
  }

  return (
    <NotificationsProvider>
      <EnfeiteFundo topo={60} />
      <Header title={title} onAbrirTour={abrirTour} />

      <div className="intranet-container">
        <Sidebar />
        <main className={`coluna-conteudo${isAniversariantesPage ? ' coluna-conteudo--fit' : ''}`}>
          <Outlet />
        </main>
        <WidgetsSidebar autoCollapse={autoCollapseWidgets} />
      </div>

      <Footer />
      <VoltarAoTopo />
      <TourIntranet aberto={tourAberto} nomeUsuario={user?.nome_completo} onFechar={fecharTour} />
    </NotificationsProvider>
  );
}
