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
import  SobreEmpresa  from './pages/SobreEmpresa';
import { SemAcessoPage } from './pages/SemAcessoPage';
import { AdminOnlyRoute, ProtectedRoute, PublicOnlyRoute } from './routes/RouteGuards';

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
          <Route path="/fala-alpes" element={<FalaAlpesPage />} />
          <Route path="/empresa" element={<SobreEmpresa />} />
          <Route path="/sem-acesso" element={<SemAcessoPage />} />
          <Route path="/admin/intranet" element={<AdminIntranetPage />} />
          <Route path="/ia/elevenlabs" element={<ElevenLabsPage />} />
          <Route path="/ia/chatgpt" element={<ChatgptPage />} />
          {/* Tela de acessos (/tecnologias) desativada temporariamente */}
        </Route>
      </Route>

      <Route element={<AdminOnlyRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/utilitarios/sorteador" element={<SorteadorPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
