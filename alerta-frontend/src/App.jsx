import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { useContext } from 'react';

import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';

// ── Protège les routes privées ────────────────────────────────────────────────
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#00C2CB] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Chargement d'Alerta...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// ── Route Admin : accessible uniquement aux admins ────────────────────────────
const AdminRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8]">
        <div className="w-10 h-10 border-4 border-[#00C2CB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return children;
};

// ── Redirige les utilisateurs déjà connectés ──────────────────────────────────
const PublicRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return null;
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* ── Routes publiques ── */}
          <Route
            path="/login"
            element={<PublicRoute><Login /></PublicRoute>}
          />
          <Route
            path="/register"
            element={<PublicRoute><Register /></PublicRoute>}
          />
          <Route
            path="/forgot-password"
            element={<PublicRoute><ForgotPassword /></PublicRoute>}
          />

          {/* ── Dashboard Principal (AdminDashboard pour Admin, Dashboard User pour Utilisateur) ── */}
          <Route
            path="/dashboard"
            element={<ProtectedRoute><Dashboard initialTab="accueil" /></ProtectedRoute>}
          />

          {/* ── Redirection /admin vers /dashboard (où AdminDashboard est affiché) ── */}
          <Route
            path="/admin"
            element={<AdminRoute><Dashboard initialTab="accueil" /></AdminRoute>}
          />

          {/* ── Section Événements (Module 3) ── */}
          <Route
            path="/events"
            element={<ProtectedRoute><Events /></ProtectedRoute>}
          />

          {/* ── Fallback ── */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
