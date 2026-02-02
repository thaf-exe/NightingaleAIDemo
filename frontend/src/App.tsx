/**
 * Main Application Component
 * 
 * REACT ROUTER EXPLAINED:
 * 
 * React Router handles navigation in single-page apps (SPAs).
 * Instead of loading new HTML pages, it swaps components.
 * 
 * Key concepts:
 * - <BrowserRouter>: Enables routing using browser history
 * - <Routes>: Container for route definitions
 * - <Route path="..." element={...}>: Maps URLs to components
 * - <Navigate>: Redirects to another route
 * - useNavigate(): Programmatic navigation
 * 
 * PROTECTED ROUTES:
 * We create wrapper components that check authentication
 * before rendering the actual page.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginForm, RegisterForm } from './components/auth';
import { LandingPage, AuthPage, PatientDashboard, ClinicianDashboard } from './pages';
import { TriageQueuePage } from './pages/TriageQueue';
import './styles/globals.css';

/**
 * Protected Route Component
 * 
 * This component checks if the user is authenticated.
 * If not, it redirects to the login page.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  // Show nothing while checking auth status
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Loading...
      </div>
    );
  }
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

/**
 * Public Route Component
 * 
 * For routes that should only be accessible when NOT logged in
 * (login, register). Redirects to dashboard if already authenticated.
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Loading...
      </div>
    );
  }
  
  // Redirect to dashboard if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

/**
 * Dashboard Router
 * 
 * Routes to the appropriate dashboard based on user role.
 * This is where RBAC happens on the frontend!
 */
function DashboardRouter() {
  const { user } = useAuth();
  
  // Route to appropriate dashboard based on role
  // Clinicians get the Triage Queue as their main view
  if (user?.role === 'clinician') {
    return <TriageQueuePage />;
  }
  
  return <PatientDashboard />;
}

/**
 * App Routes Component
 * 
 * Separated from App so it can use useAuth hook
 * (hooks must be used inside the Provider)
 */
function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthPage>
              <LoginForm />
            </AuthPage>
          </PublicRoute>
        }
      />
      
      <Route
        path="/register"
        element={
          <PublicRoute>
            <AuthPage>
              <RegisterForm />
            </AuthPage>
          </PublicRoute>
        }
      />
      
      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardRouter />
          </ProtectedRoute>
        }
      />
      
      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * Main App Component
 * 
 * Wraps everything with providers:
 * - BrowserRouter: Enables routing
 * - AuthProvider: Provides auth state to all children
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
