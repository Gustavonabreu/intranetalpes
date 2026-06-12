import { NavLink } from 'react-router-dom';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `nav-link${isActive ? ' ativo' : ''}`;

export function Sidebar() {
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
            <NavLink to="/tecnologias" className={navLinkClass}>
              <i className="fas fa-rocket" />
              <span>Acessos</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <a href="https://chatwoot.amtechautomatik.com.br/" target="_blank" rel="noreferrer">
              <i className="fa-regular fa-comment" />
              <span>Chat</span>
            </a>
          </li>

          <li className="nav-item">
            <NavLink to="/equipamentos" className={navLinkClass}>
              <i className="fa-regular fa-hard-drive" />
              <span>Equipamentos</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/fala-alpes" className={navLinkClass}>
              <i className="fa-solid fa-head-side-virus" />
              <span>Fala Alpes</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/utilitarios/sorteador" className={navLinkClass}>
              <i className="fa-solid fa-question" />
              <span>Sorteador</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/admin/intranet" className={navLinkClass}>
              <i className="fa-solid fa-gear" />
              <span>Admin Intranet</span>
            </NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
