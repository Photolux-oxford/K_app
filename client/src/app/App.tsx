import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ServiceAreaPage } from './pages/ServiceAreaPage';
import { ServiceAreaEditor } from './components/admin/ServiceAreaEditor';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminBookings } from './pages/admin/AdminBookings';
import { AdminEditing } from './pages/admin/AdminEditing';
import { AdminAvailability } from './pages/admin/AdminAvailability';
import { Cursor } from './components/Cursor';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Portfolio } from './components/Portfolio';
import { Services } from './components/Services';
import { About } from './components/About';
import { Footer } from './components/Footer';

function HomePage() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />
      <main>
        <Hero />
        <Portfolio />
        <Services />
        <About />
      </main>
      <Footer />
    </div>
  );
}

// Placeholder pages — replaced in later plans
function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 14, color: '#888', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
        {label} — coming soon
      </p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Cursor />
        <Routes>
          {/* Public */}
          <Route path="/"            element={<HomePage />} />
          <Route path="/login"       element={<LoginPage />} />
          <Route path="/register"    element={<RegisterPage />} />
          <Route path="/service-area" element={<ServiceAreaPage />} />

          {/* Customer (login required) */}
          <Route path="/book"      element={<ProtectedRoute><ComingSoon label="Book a Session" /></ProtectedRoute>} />
          <Route path="/editing"   element={<ProtectedRoute><ComingSoon label="Photo Editing" /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><ComingSoon label="Dashboard" /></ProtectedRoute>} />
          <Route path="/messages"  element={<ProtectedRoute><ComingSoon label="Messages" /></ProtectedRoute>} />

          {/* Admin routes (Kay only) */}
          <Route path="/admin" element={
            <ProtectedRoute requireStaff>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/bookings" element={
            <ProtectedRoute requireStaff>
              <AdminBookings />
            </ProtectedRoute>
          } />
          <Route path="/admin/availability" element={
            <ProtectedRoute requireStaff>
              <AdminAvailability />
            </ProtectedRoute>
          } />
          <Route path="/admin/editing" element={
            <ProtectedRoute requireStaff>
              <AdminEditing />
            </ProtectedRoute>
          } />
          <Route path="/admin/service-area" element={
            <ProtectedRoute requireStaff>
              <div style={{ padding: '80px 48px' }}>
                <ServiceAreaEditor />
              </div>
            </ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
