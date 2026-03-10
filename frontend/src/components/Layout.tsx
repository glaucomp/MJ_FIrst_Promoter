import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Navigation from './Navigation';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7fafc' }}>
      {/* Sidebar Navigation */}
      <Navigation isOpen={sidebarOpen} />

      {/* Main Content Area */}
      <div style={{
        marginLeft: sidebarOpen ? '260px' : '80px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        transition: 'margin-left 0.3s ease',
        minHeight: '100vh'
      }}>
        {/* Top Header Bar */}
        <header style={{
          background: 'white',
          padding: '1rem 2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f7fafc'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              ☰
            </button>
            <div>
              <h1 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#2d3748',
                margin: 0
              }}>
                {user?.role === 'ADMIN' ? 'Admin Dashboard' : 'Promoter Dashboard'}
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Notifications */}
            <button style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              position: 'relative'
            }}>
              🔔
              <span style={{
                position: 'absolute',
                top: '0.25rem',
                right: '0.25rem',
                width: '8px',
                height: '8px',
                background: '#f56565',
                borderRadius: '50%'
              }}></span>
            </button>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="btn"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1.25rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(102, 126, 234, 0.3)';
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main style={{
          flex: 1,
          padding: '2rem',
          overflowY: 'auto'
        }}>
          {children}
        </main>

        {/* Footer */}
        <footer style={{
          background: 'white',
          borderTop: '1px solid #e2e8f0',
          padding: '1rem 2rem',
          textAlign: 'center',
          fontSize: '0.875rem',
          color: '#718096'
        }}>
          <p>© 2026 MJ First Promoter. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default Layout;
