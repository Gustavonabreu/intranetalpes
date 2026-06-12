import { Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from './components/MainLayout';
import { AniversariantesPage } from './pages/AniversariantesPage';
import { ChatgptPage } from './pages/ChatgptPage';
import { DashboardPage } from './pages/DashboardPage';
import { ElevenLabsPage } from './pages/ElevenLabsPage';
import EquipamentosPage from './pages/EquipamentosPage';
import { FalaAlpesPage } from './pages/FalaAlpesPage';
import { LoginPage } from './pages/LoginPage';
import { NossaEquipePage } from './pages/NossaEquipePage';
import { NoticiasPage } from './pages/NoticiasPage';
import { AdminIntranetPage } from './pages/AdminIntranetPage';
import { SorteadorPage } from './pages/SorteadorPage';
import { TecnologiasPage } from './pages/TecnologiasPage';
import { ProtectedRoute, PublicOnlyRoute } from './routes/RouteGuards';

function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/nossa-equipe" element={<NossaEquipePage />} />
          <Route path="/aniversariantes" element={<AniversariantesPage />} />
          <Route path="/noticias" element={<NoticiasPage />} />
          <Route path="/equipamentos" element={<EquipamentosPage />} />
          <Route path="/tecnologias" element={<TecnologiasPage />} />
          <Route path="/fala-alpes" element={<FalaAlpesPage />} />
          <Route path="/ia/chatgpt" element={<ChatgptPage />} />
          <Route path="/ia/elevenlabs" element={<ElevenLabsPage />} />
          <Route path="/utilitarios/sorteador" element={<SorteadorPage />} />
          <Route path="/admin/intranet" element={<AdminIntranetPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
