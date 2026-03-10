import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface NavigationProps {
  isOpen: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ isOpen }) => {
  const { user } = useAuth();

  const adminLinks = [
    { path: '/dashboard', icon: '📊', label: 'Dashboard' },
    { path: '/campaigns', icon: '🎯', label: 'Campaigns' },
    { path: '/promoters', icon: '👥', label: 'Promoters' },
    { path: '/commissions', icon: '💰', label: 'Commissions' },
    { path: '/customers', icon: '🛍️', label: 'Customers' },
    { path: '/reports', icon: '📈', label: 'Reports' },
    { path: '/settings', icon: '⚙️', label: 'Settings' }
  ];

  const promoterLinks = [
    { path: '/dashboard', icon: '📊', label: 'Dashboard' },
    { path: '/referrals', icon: '👥', label: 'My Referrals' },
    { path: '/earnings', icon: '💰', label: 'My Earnings' },
    { path: '/tracking-links', icon: '🔗', label: 'Tracking Links' },
    { path: '/profile', icon: '👤', label: 'Profile' }
  ];

  const links = user?.role === 'ADMIN' ? adminLinks : promoterLinks;

  return (
    <aside style={{
      width: isOpen ? '260px' : '80px',
      background: 'linear-gradient(180deg, #2d3748 0%, #1a202c 100%)',
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
      transition: 'width 0.3s ease',
      boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      overflowX: 'hidden'
    }}>
      {/* Logo Section */}
      <div style={{
        padding: '1.5rem 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        textAlign: isOpen ? 'left' : 'center'
      }}>
        <h2 style={{
          color: 'white',
          fontSize: isOpen ? '1.25rem' : '1.5rem',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          overflow: 'hidden'
        }}>
          {isOpen ? 'MJ Promoter' : '🚀'}
        </h2>
      </div>

      {/* Navigation Links */}
      <nav style={{
        flex: 1,
        padding: '1rem 0',
        overflowY: 'auto'
      }}>
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              padding: '0.875rem 1rem',
              margin: '0.25rem 0.5rem',
              borderRadius: '0.5rem',
              color: isActive ? 'white' : 'rgba(255,255,255,0.7)',
              background: isActive ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              fontSize: '0.95rem',
              fontWeight: isActive ? '600' : '400',
              gap: '0.75rem',
              position: 'relative',
              justifyContent: isOpen ? 'flex-start' : 'center'
            })}
            onMouseEnter={(e) => {
              if (e.currentTarget.style.background === 'transparent') {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }
            }}
            onMouseLeave={(e) => {
              const isActive = e.currentTarget.classList.contains('active');
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <span style={{ fontSize: '1.25rem', minWidth: '24px', textAlign: 'center' }}>
              {link.icon}
            </span>
            {isOpen && (
              <span style={{ whiteSpace: 'nowrap' }}>{link.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Info Section */}
      {user && (
        <div style={{
          padding: '1rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          color: 'white'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            justifyContent: isOpen ? 'flex-start' : 'center'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '1rem',
              flexShrink: 0
            }}>
              {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
            </div>
            {isOpen && (
              <div style={{ overflow: 'hidden' }}>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {user.firstName} {user.lastName}
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.6)'
                }}>
                  {user.role === 'ADMIN' ? 'Administrator' : 'Promoter'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};

export default Navigation;
