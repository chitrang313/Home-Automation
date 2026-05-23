import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  // import.meta.env.BASE_URL is '/' in dev and '/Home-Automation/' in prod build
  // (set by vite.config.js). React Router needs this to handle sub-path correctly.
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <UserDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Welcome />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
