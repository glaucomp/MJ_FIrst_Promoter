import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DashboardLayout } from './components/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { Models } from './pages/Models';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Campaigns } from './pages/Campaigns';
import { Payouts } from './pages/Payouts';
import { Chatters } from './pages/Chatters';
import { ChatterGroups } from './pages/ChatterGroups';
import { ChatterDashboard } from './pages/ChatterDashboard';
import { ChatterGroupToolsPage } from './pages/ChatterGroupToolsPage';
import { Login } from './pages/Login';
import type { ReactNode } from 'react';
import type { UserRole } from './types';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="text-white text-[18px]">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.baseRole)) {
    return <Navigate to={user.baseRole === 'chatter' ? '/chatter-portal' : '/dashboard'} replace />;
  }

  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="text-white text-[18px]">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to={user.baseRole === 'chatter' ? '/chatter-portal' : '/dashboard'} replace />;
  }

  return <>{children}</>;
};

const ChatterRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={user?.baseRole === 'chatter' ? '/chatter-portal' : '/dashboard'} replace />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ChatterRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Dashboard />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chatter-portal"
        element={
          <ProtectedRoute allowedRoles={['chatter']}>
            <DashboardLayout>
              <ChatterDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chatter-portal/group/:groupId"
        element={
          <ProtectedRoute allowedRoles={['chatter']}>
            <DashboardLayout>
              <ChatterGroupToolsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/models"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Models />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chatters"
        element={
          <ProtectedRoute allowedRoles={['account_manager']}>
            <DashboardLayout>
              <Chatters />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chatter-groups"
        element={
          <ProtectedRoute allowedRoles={['account_manager']}>
            <DashboardLayout>
              <ChatterGroups />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/campaigns"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DashboardLayout>
              <Campaigns />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payouts"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DashboardLayout>
              <Payouts />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Reports />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Settings />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={
          <div className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center justify-center gap-[16px]">
            <p className="text-white text-[32px] font-bold">404</p>
            <p className="text-[#9e9e9e] text-[16px]">Page not found</p>
            <Link
              to="/dashboard"
              className="mt-[8px] text-[#ff2a71] text-[14px] font-semibold hover:underline"
            >
              Go to Dashboard
            </Link>
          </div>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
