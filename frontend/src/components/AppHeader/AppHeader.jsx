import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import notificationIcon from '../../assets/icons/Sino.svg';
import logoutIcon from '../../assets/icons/Sair.svg';
import './AppHeader.css';

function AppHeader({
  title = 'AgroTask',
  onMenuClick = null,
  showMenuButton = false,
}) {
  const navigate = useNavigate();
  const storedUser = JSON.parse(localStorage.getItem('agrotask_user') || '{}');

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);

  const userMenuRef = useRef(null);
  const notificationsRef = useRef(null);

  const userName = storedUser.name || 'Usuário';
  const userRole = storedUser.role === 'ADMIN' ? 'Administrador' : 'Funcionário';

  const getUserInitials = (name) => {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
  };

  const userInitials = getUserInitials(userName);

  const formatDate = (dateValue) => {
    if (!dateValue) {
      return '';
    }

    return new Intl.DateTimeFormat('pt-BR').format(new Date(dateValue));
  };

  const handleLogout = () => {
    localStorage.removeItem('agrotask_token');
    localStorage.removeItem('agrotask_user');
    localStorage.removeItem('agrotask_farm');
    localStorage.removeItem('agrotask_membership');
    navigate('/', { replace: true });
  };

  const loadNotifications = async () => {
    const token = localStorage.getItem('agrotask_token');

    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoadingNotifications(false);
      return;
    }

    try {
      setIsLoadingNotifications(true);

      const response = await api.get('/notifications');

      setNotifications(response.data?.notifications || []);
      setUnreadCount(response.data?.unreadCount || 0);
    } catch (error) {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  useEffect(() => {
    loadNotifications();

    const interval = setInterval(() => {
      loadNotifications();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target)
      ) {
        setIsUserMenuOpen(false);
      }

      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target)
      ) {
        setIsNotificationsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const hasUnreadNotifications = unreadCount > 0;

  const notificationButtonLabel = useMemo(() => {
    if (hasUnreadNotifications) {
      return `Notificações (${unreadCount} não lida${unreadCount > 1 ? 's' : ''})`;
    }

    return 'Notificações';
  }, [hasUnreadNotifications, unreadCount]);

  const handleNotificationClick = async (notification) => {
    try {
      if (!notification.isRead) {
        const response = await api.patch(`/notifications/${notification.id}/read`);

        setUnreadCount(response.data?.unreadCount || 0);
        setNotifications((currentNotifications) =>
          currentNotifications.map((item) =>
            item.id === notification.id
              ? {
                  ...item,
                  isRead: true,
                  readAt: new Date().toISOString(),
                }
              : item
          )
        );
      }
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
    } finally {
      setIsNotificationsOpen(false);
      navigate(`/task-details/${notification.taskId}`);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');

      setUnreadCount(0);
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) => ({
          ...notification,
          isRead: true,
        }))
      );
    } catch (error) {
      console.error('Erro ao marcar todas as notificações como lidas:', error);
    }
  };

  return (
    <header className="app-header">
      <div className="app-header-left">
        {showMenuButton && (
          <button
            type="button"
            className="app-header-menu-button"
            onClick={onMenuClick}
            aria-label="Abrir menu lateral"
          >
            <span />
            <span />
            <span />
          </button>
        )}

        <h1>{title}</h1>
      </div>

      <div className="app-header-right">
        <div className="app-header-notifications-wrapper" ref={notificationsRef}>
          <button
            type="button"
            className={`app-header-notification ${
              hasUnreadNotifications
                ? 'app-header-notification--active'
                : 'app-header-notification--inactive'
            }`}
            aria-label={notificationButtonLabel}
            onClick={() => {
              setIsNotificationsOpen((prev) => !prev);
              setIsUserMenuOpen(false);
            }}
          >
            <img
              src={notificationIcon}
              alt=""
              className="app-header-notification-icon"
            />

            {hasUnreadNotifications && (
              <span className="app-header-notification-badge">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <div className="app-header-notifications-dropdown">
              <div className="app-header-notifications-header">
                <div className="app-header-notifications-header-text">
                  <strong>Notificações</strong>
                  <span>
                    {isLoadingNotifications
                      ? 'Atualizando...'
                      : `${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}`}
                  </span>
                </div>

                {notifications.length > 0 && unreadCount > 0 && (
                  <button
                    type="button"
                    className="app-header-notifications-read-all"
                    onClick={handleMarkAllAsRead}
                  >
                    Marcar todas como lidas
                  </button>
                )}
              </div>

              <div className="app-header-notifications-list">
                {!isLoadingNotifications && notifications.length === 0 && (
                  <div className="app-header-notifications-empty">
                    Nenhuma notificação no momento.
                  </div>
                )}

                {isLoadingNotifications && (
                  <div className="app-header-notifications-empty">
                    Carregando notificações...
                  </div>
                )}

                {!isLoadingNotifications &&
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className={`app-header-notification-item app-header-notification-item--${notification.type.toLowerCase()} ${
                        notification.isRead
                          ? 'app-header-notification-item--read'
                          : 'app-header-notification-item--unread'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="app-header-notification-item-dot" />

                      <div className="app-header-notification-item-content">
                        <div className="app-header-notification-item-top">
                          <strong>{notification.title}</strong>

                          {notification.task?.deadline && (
                            <span className="app-header-notification-date">
                              {formatDate(notification.task.deadline)}
                            </span>
                          )}
                        </div>

                        <span>{notification.message}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="app-header-user-wrapper" ref={userMenuRef}>
          <button
            type="button"
            className="app-header-avatar-button"
            onClick={() => {
              setIsUserMenuOpen((prev) => !prev);
              setIsNotificationsOpen(false);
            }}
            aria-label="Abrir menu do usuário"
          >
            <div className="app-header-avatar">{userInitials}</div>
          </button>

          {isUserMenuOpen && (
            <div className="app-header-user-dropdown">
              <div className="app-header-user-dropdown-info">
                <strong>{userName}</strong>
                <span>{userRole}</span>
              </div>

              <button
                type="button"
                className="app-header-user-dropdown-logout"
                onClick={handleLogout}
              >
                <img src={logoutIcon} alt="" />
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
