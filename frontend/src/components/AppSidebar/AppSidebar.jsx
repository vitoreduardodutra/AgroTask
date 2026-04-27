import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoAgroTask from '../../assets/icons/LogoAgroTask.svg';
import dashboardIcon from '../../assets/icons/Dashboard.svg';
import tasksIcon from '../../assets/icons/Tarefas.svg';
import minhaFazendaIcon from '../../assets/icons/MinhaFazenda.svg';
import './AppSidebar.css';

function AppSidebar({ isOpen = false, onClose = () => {} }) {
  const location = useLocation();
  const navigate = useNavigate();

  const storedMembership = JSON.parse(
    localStorage.getItem('agrotask_membership') || '{}'
  );

  const isAdmin = storedMembership.role === 'ADMIN';

  const handleNavigateAndClose = () => {
    if (window.innerWidth <= 900) {
      onClose();
    }
  };

  const isTasksSectionActive =
    location.pathname === '/tasks' ||
    location.pathname === '/new-task' ||
    location.pathname.startsWith('/task-details/') ||
    location.pathname.startsWith('/edit-task/') ||
    location.pathname.startsWith('/evidences/');

  return (
    <aside className={`app-sidebar ${isOpen ? 'app-sidebar--open' : ''}`}>
      <div>
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-icon">
            <img src={logoAgroTask} alt="Logo AgroTask" />
          </div>

          <div className="app-sidebar-brand-text">
            <strong>AgroTask</strong>
            <span>Gestão Agrícola</span>
          </div>

          <button
            type="button"
            className="app-sidebar-close-button"
            onClick={onClose}
            aria-label="Fechar menu lateral"
          >
            ×
          </button>
        </div>

        <div className="app-sidebar-section-title">Menu</div>

        <nav className="app-sidebar-menu">
          <Link
            to="/dashboard"
            className={`app-sidebar-menu-item ${
              location.pathname === '/dashboard' ? 'active' : ''
            }`}
            onClick={handleNavigateAndClose}
          >
            <span className="app-sidebar-menu-icon">
              <img src={dashboardIcon} alt="" className="app-sidebar-menu-icon-img" />
            </span>
            <span>Dashboard</span>
            {location.pathname === '/dashboard' && (
              <span className="app-sidebar-menu-arrow">›</span>
            )}
          </Link>

          <Link
            to="/tasks"
            className={`app-sidebar-menu-item ${isTasksSectionActive ? 'active' : ''}`}
            onClick={handleNavigateAndClose}
          >
            <span className="app-sidebar-menu-icon">
              <img src={tasksIcon} alt="" className="app-sidebar-menu-icon-img" />
            </span>
            <span>Tarefas</span>
            {isTasksSectionActive && (
              <span className="app-sidebar-menu-arrow">›</span>
            )}
          </Link>

          {isAdmin && (
            <Link
              to="/farm"
              className={`app-sidebar-menu-item ${
                location.pathname === '/farm' ? 'active' : ''
              }`}
              onClick={handleNavigateAndClose}
            >
              <span className="app-sidebar-menu-icon">
                <img
                  src={minhaFazendaIcon}
                  alt=""
                  className="app-sidebar-menu-icon-img"
                />
              </span>
              <span>Minha Fazenda</span>
              {location.pathname === '/farm' && (
                <span className="app-sidebar-menu-arrow">›</span>
              )}
            </Link>
          )}
        </nav>
      </div>
    </aside>
  );
}

export default AppSidebar;