import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { legacyGetJson } from '../services/legacyApi';
import { handlePhotoFallback } from '../services/photoFallback';
import logoAlpes from '../assets/brand/logo-alpes-white.png';

type HeaderProps = {
  title: string;
};

export function Header({ title }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const userName = user?.nome_completo || 'Usuario';
  const userAvatar = user?.imagem_url || 'https://dummyimage.com/40x40/cccccc/333333&text=U';

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const isDark = savedTheme === 'dark';
    setDarkMode(isDark);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dark-mode', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    let mounted = true;

    async function loadHeaderData() {
      try {
        const data = await legacyGetJson<{ notificacoes?: Array<{ id: number }> }>(
          '/api/notificacoes/'
        );
        if (!mounted) return;
        setNotificationsCount(data.notificacoes?.length || 0);
      } catch {
        if (!mounted) return;
        setNotificationsCount(0);
      }
    }

    loadHeaderData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function closeMenu() {
      setMenuOpen(false);
    }

    window.addEventListener('click', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
    };
  }, []);

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

        <div className="notificacao-container">
          <button className="header-btn" type="button" aria-label="Notificacoes">
            <i className="fas fa-bell" />
            {notificationsCount > 0 ? (
              <span className="notificacao-contador">{notificationsCount}</span>
            ) : null}
          </button>
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
