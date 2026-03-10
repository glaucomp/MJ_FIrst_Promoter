import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Overview from './pages/Overview';
import PromoterOverview from './pages/PromoterOverview';
import Referrals from './pages/Referrals';
import Commissions from './pages/Commissions';
import Customers from './pages/Customers';
import Promoters from './pages/Promoters';
import Campaigns from './pages/Campaigns';
import Layout from './components/Layout';

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div>Loading...</div>
    </div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const DashboardRouter = () => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case 'ADMIN':
      return <Overview />;
    case 'PROMOTER':
      return <PromoterOverview />;
    default:
      return <Navigate to="/login" replace />;
  }
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Dashboard Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardRouter />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardRouter />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          {/* Admin Routes */}
          <Route
            path="/campaigns"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Layout>
                  <Campaigns />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/promoters"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Layout>
                  <Promoters />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Layout>
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <h2>📈 Reports & Analytics</h2>
                    <p style={{ color: '#718096', marginTop: '1rem' }}>Coming soon...</p>
                  </div>
                </Layout>
              </ProtectedRoute>
            }
          />
          
          {/* Shared Routes */}
          <Route
            path="/commissions"
            element={
              <ProtectedRoute>
                <Layout>
                  <Commissions />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Layout>
                  <Customers />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          {/* Promoter Routes */}
          <Route
            path="/referrals"
            element={
              <ProtectedRoute allowedRoles={['PROMOTER']}>
                <Layout>
                  <Referrals />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/earnings"
            element={
              <ProtectedRoute allowedRoles={['PROMOTER']}>
                <Layout>
                  <Commissions />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tracking-links"
            element={
              <ProtectedRoute allowedRoles={['PROMOTER']}>
                <Layout>
                  <Referrals />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={['PROMOTER']}>
                <Layout>
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <h2>👤 Profile Settings</h2>
                    <p style={{ color: '#718096', marginTop: '1rem' }}>Coming soon...</p>
                  </div>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <h2>⚙️ Settings</h2>
                    <p style={{ color: '#718096', marginTop: '1rem' }}>Coming soon...</p>
                  </div>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
