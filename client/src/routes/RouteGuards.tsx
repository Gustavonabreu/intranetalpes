import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const PUBLIC_ROUTES = [
  '/dashboard',
  '/nossa-equipe',
  '/aniversariantes',
  '/noticias',
  '/empresa',
  '/equipamentos',
  '/fala-alpes',
  '/sem-acesso'
];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function ProtectedRoute() {
  const { loading, isAuthenticated, isAdmin, canAccessRoute, sessaoExpirada } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="coluna-conteudo">Verificando sessao...</div>;
  }

  if (!isAuthenticated) {
    const redirectTo = encodeURIComponent(`${location.pathname}${location.search}`);
    const motivo = sessaoExpirada ? 'reason=session_expired&' : '';
    return <Navigate to={`/login?${motivo}next=${redirectTo}`} replace />;
  }

  if (isAdmin || isPublicRoute(location.pathname)) {
    return <Outlet />;
  }

  if (!canAccessRoute(location.pathname)) {
    return <Navigate to="/sem-acesso" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <div className="coluna-conteudo">Verificando sessao...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function AdminOnlyRoute() {
  const { loading, isAuthenticated, isAdmin, sessaoExpirada } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="coluna-conteudo">Verificando permissoes...</div>;
  }

  if (!isAuthenticated) {
    const redirectTo = encodeURIComponent(`${location.pathname}${location.search}`);
    const motivo = sessaoExpirada ? 'reason=session_expired&' : '';
    return <Navigate to={`/login?${motivo}next=${redirectTo}`} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
