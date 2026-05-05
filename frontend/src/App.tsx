import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DashboardLayout } from './components/DashboardLayout';
import type { UserRole } from './types';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Models = lazy(() => import('./pages/Models').then((m) => ({ default: m.Models })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Campaigns = lazy(() => import('./pages/Campaigns').then((m) => ({ default: m.Campaigns })));
const Payouts = lazy(() => import('./pages/Payouts').then((m) => ({ default: m.Payouts })));
const ChatterGroups = lazy(() => import('./pages/ChatterGroups').then((m) => ({ default: m.ChatterGroups })));
const ChatterDashboard = lazy(() =>
  import('./pages/ChatterDashboard').then((m) => ({ default: m.ChatterDashboard })),
);
const ChatterGroupToolsPage = lazy(() =>
  import('./pages/ChatterGroupToolsPage').then((m) => ({ default: m.ChatterGroupToolsPage })),
);
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const SetPassword = lazy(() => import('./pages/SetPassword').then((m) => ({ default: m.SetPassword })));
const FirstPasswordChange = lazy(() =>
  import('./pages/FirstPasswordChange').then((m) => ({ default: m.FirstPasswordChange })),
);

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
    return <Navigate to={defaultLandingFor(user.baseRole)} replace />;
  }

  return <>{children}</>;
};

const defaultLandingFor = (role: UserRole): string => {
  if (role === 'chatter') return '/chatter-portal';
  if (role === 'payer') return '/reports';
  return '/dashboard';
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
    return <Navigate to={defaultLandingFor(user.baseRole)} replace />;
  }

  return <>{children}</>;
};

const ChatterRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={user ? defaultLandingFor(user.baseRole) : '/login'} replace />;
};

const RouteFallback = () => (
  <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
    <div className="text-white text-[18px]">Loading...</div>
  </div>
);

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/set-password/:token" element={<SetPassword />} />
      {/* Reached only via Login.tsx after a `requirePasswordChange` login.
          Public route (no auth gate, no PublicRoute redirect) because the
          user has no session cookie yet — they're holding a short-lived
          changeToken in router state instead. */}
      <Route path="/first-password-change" element={<FirstPasswordChange />} />
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
          <ProtectedRoute allowedRoles={['admin', 'account_manager', 'team_manager', 'promoter']}>
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
        path="/referrals"
        element={
          <ProtectedRoute allowedRoles={['account_manager', 'team_manager', 'promoter']}>
            <DashboardLayout>
              <Models />
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
          <ProtectedRoute allowedRoles={['admin', 'payer']}>
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
    </Suspense>
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
