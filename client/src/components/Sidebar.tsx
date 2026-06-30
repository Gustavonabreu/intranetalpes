import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import  iconeFalaAlpes  from '../assets/brand/falaalpes.png';

const navLinkClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' ativo' : ''}`;

export function Sidebar() {
  const { canAccessRoute, isAdmin } = useAuth();

  return (
    <aside className="coluna-nav icon-nav">
      <nav className="menu-principal">
        <ul>
          <li className="nav-item">
            <NavLink to="/dashboard" className={navLinkClass}>
              <i className="fas fa-tachometer-alt" />
              <span>Dashboard</span>
            </NavLink>
          </li>

          <li className="nav-item has-submenu">
            <NavLink to="/nossa-equipe" className={navLinkClass}>
              <i className="fas fa-users" />
              <span>Nossa Equipe</span>
            </NavLink>
            <ul className="submenu">
              <li>
                <NavLink to="/aniversariantes">Aniversariantes</NavLink>
              </li>
              <li>
                <NavLink to="/nossa-equipe">Nossa Equipe</NavLink>
              </li>
            </ul>
          </li>

          <li className="nav-item">
            <NavLink to="/noticias" className={navLinkClass}>
              <i className="fas fa-newspaper" />
              <span>Noticias</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/empresa" className={navLinkClass}>
              <i className="fas fa-newspaper" />
              <span>Sobre a Empresa</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/equipamentos" className={navLinkClass}>
              <i className="fa-regular fa-hard-drive" />
              <span>Equipamentos</span>
            </NavLink>
          </li>
          
          <li className="nav-item">
            <NavLink to="/fala-alpes" className={navLinkClass}>
              <img 
                src={iconeFalaAlpes} 
                alt="Fala Alpes" // Importante para acessibilidade
                style={{ 
                  width: '30px',  // Tamanho proporcional aos outros ícones
                  height: '30px', 
                  display: 'block', // Muda para bloco para ocupar a largura total
                  margin: '0 auto 5px auto', // Centraliza e dá um espaço pro texto
                  // Se precisar forçar a cor cinza:
                  // filter: 'brightness(0) invert(0.5)'
                }}
              />
              <span>Fala Alpes</span>
            </NavLink>
          </li>

          {canAccessRoute('/admin/intranet') ? (
            <li className="nav-item">
              <NavLink to="/admin/intranet" className={navLinkClass}>
                <i className="fa-solid fa-gear" />
                <span>Admin Intranet</span>
              </NavLink>
            </li>
          ) : null}

          {isAdmin ? (
            <li className="nav-item">
              <NavLink to="/utilitarios/sorteador" className={navLinkClass}>
                <i className="fa-solid fa-question" />
                <span>Sorteador</span>
              </NavLink>
            </li>
          ) : null}

          {/* Tela de acessos (/tecnologias) desativada temporariamente */}
        </ul>
      </nav>
    </aside>
  );
}
