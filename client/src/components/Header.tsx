import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { handlePhotoFallback } from '../services/photoFallback';
import { SISTEMAS } from '../config/sistemas';
import { ApexLogo } from './ApexLogo';
import logoAlpes from '../assets/brand/logo-alpes-white.png';

type HeaderProps = {
  title: string;
};

function formatNotificationDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function Header({ title }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { noticias, unreadCount, isRead, markAsRead, markAllAsRead } = useNotifications();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [sistemasOpen, setSistemasOpen] = useState(false);

  const userName = user?.nome_completo || 'Usuario';
  const userAvatar = user?.imagem_url || 'https://dummyimage.com/40x40/cccccc/333333&text=U';

  useEffect(() => {
    document.body.classList.toggle('dark-mode', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    function closeOverlays() {
      setMenuOpen(false);
      setNotifOpen(false);
      setSistemasOpen(false);
    }

    window.addEventListener('click', closeOverlays);
    return () => {
      window.removeEventListener('click', closeOverlays);
    };
  }, []);

  function openNotificacao(id: number) {
    markAsRead(id);
    setNotifOpen(false);
    navigate('/noticias');
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="header-principal">
      <div className="header-esquerda">
      </div>

      <div className="header-centro">
        <Link to="/dashboard" className="header-logo">
          <img
            src={logoAlpes}
            alt="Logo Grupo Alpes"
          />
        </Link>
      </div>

      <div className="header-direita">
        <div className="user-profile-area">
          <div id="user-logged-in" style={{ display: 'flex' }}>
            <div
              id="user-profile-trigger"
              className="user-profile-trigger"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((current) => !current);
              }}
            >
              <img
                id="user-avatar"
                src={userAvatar}
                alt="Avatar do usuario"
                onError={(event) =>
                  handlePhotoFallback(event, 'https://dummyimage.com/40x40/cccccc/333333&text=U')
                }
              />
              <span id="user-name">{userName}</span>
            </div>

            <div className={`user-dropdown-menu ${menuOpen ? 'ativo' : ''}`}>
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  handleLogout();
                }}
              >
                <i className="fas fa-sign-out-alt" />
                Sair
              </a>
            </div>
          </div>
        </div>

        <div className="sistemas-container" onClick={(event) => event.stopPropagation()}>
          <button
            className="header-btn"
            type="button"
            aria-label="Acessar outros sistemas"
            aria-expanded={sistemasOpen}
            title="Sistemas Alpes"
            onClick={() => {
              setNotifOpen(false);
              setSistemasOpen((current) => !current);
            }}
          >
            <svg className="sistemas-grade" viewBox="0 0 24 24" aria-hidden="true">
              {[4, 12, 20].map((cy) =>
                [4, 12, 20].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.4" />)
              )}
            </svg>
          </button>

          <div className={`sistemas-dropdown ${sistemasOpen ? 'visivel' : ''}`}>
            <div className="sistemas-dropdown-head">
              <strong>Sistemas Alpes</strong>
              <span>Acesso rapido</span>
            </div>
            <ul className="sistemas-lista">
              {SISTEMAS.map((sistema) => {
                const logo = (
                  <ApexLogo
                    svg={sistema.logo}
                    idPrefix={`logo-${sistema.id}`}
                    className="sistema-logo"
                  />
                );
                return (
                  <li key={sistema.id}>
                    {sistema.url ? (
                      <a
                        href={sistema.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sistema-item"
                        aria-label={`Abrir ${sistema.nome} em nova aba`}
                        title={`Abrir ${sistema.nome}`}
                        onClick={() => setSistemasOpen(false)}
                      >
                        {logo}
                        <i className="fas fa-arrow-up-right-from-square sistema-externo" />
                      </a>
                    ) : (
                      <span
                        className="sistema-item desabilitado"
                        aria-label={`${sistema.nome}: link ainda nao configurado`}
                        title="Link ainda nao configurado"
                      >
                        {logo}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="notificacao-container" onClick={(event) => event.stopPropagation()}>
          <button
            className="header-btn"
            type="button"
            aria-label="Notificacoes"
            onClick={() => {
              setSistemasOpen(false);
              setNotifOpen((current) => !current);
            }}
          >
            <i className="fas fa-bell" />
            {unreadCount > 0 ? (
              <span className="notificacao-contador" style={{ display: 'flex' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </button>

          <div className={`notificacoes-dropdown ${notifOpen ? 'visivel' : ''}`}>
            <div className="notificacoes-dropdown-head">
              <strong>Notificacoes</strong>
              {unreadCount > 0 ? (
                <button type="button" className="notif-marcar-todas" onClick={markAllAsRead}>
                  Marcar todas como lidas
                </button>
              ) : null}
            </div>

            <div className="notificacoes-lista">
              {noticias.length === 0 ? (
                <div className="notificacao-item notificacao-vazia">
                  Nenhuma noticia no momento.
                </div>
              ) : (
                noticias.map((noticia) => {
                  const unread = !isRead(noticia.id);
                  return (
                    <div
                      key={noticia.id}
                      className={`notificacao-item ${unread ? 'nao-lida' : ''}`}
                      onClick={() => openNotificacao(noticia.id)}
                    >
                      <div className="notificacao-item-titulo">
                        {unread ? <span className="notif-dot" /> : null}
                        <span>{noticia.titulo}</span>
                      </div>
                      <div className="notificacao-item-meta">
                        <span>{formatNotificationDate(noticia.data_publicacao)}</span>
                        {unread ? (
                          <button
                            type="button"
                            className="notif-ler-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              markAsRead(noticia.id);
                            }}
                          >
                            Marcar como lida
                          </button>
                        ) : (
                          <span className="notif-lida-tag">Lida</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <label className="switch" aria-label="Alternar tema">
          <input
            id="theme-toggle"
            type="checkbox"
            checked={darkMode}
            onChange={(event) => setDarkMode(event.target.checked)}
          />
          <div className="slider round">
            <div className="sun-moon" />
            <div className="stars">
              <svg id="star-1" className="star" viewBox="0 0 20 20">
                <path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" />
              </svg>
              <svg id="star-2" className="star" viewBox="0 0 20 20">
                <path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" />
              </svg>
              <svg id="star-3" className="star" viewBox="0 0 20 20">
                <path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" />
              </svg>
              <svg id="star-4" className="star" viewBox="0 0 20 20">
                <path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" />
              </svg>
            </div>
          </div>
        </label>
      </div>
    </header>
  );
}
