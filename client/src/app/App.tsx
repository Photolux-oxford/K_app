import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ServiceAreaPage } from './pages/ServiceAreaPage';
import { ServiceAreaEditor } from './components/admin/ServiceAreaEditor';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminBookings } from './pages/admin/AdminBookings';
import { AdminEditing } from './pages/admin/AdminEditing';
import { AdminAvailability } from './pages/admin/AdminAvailability';
import { AdminPortfolio } from './pages/admin/AdminPortfolio';
import { AdminMessages } from './pages/admin/AdminMessages';
import { MessagesPage } from './pages/MessagesPage';
import { DashboardPage } from './pages/DashboardPage';
import { Toaster } from './components/ui/sonner';
import { BookPage } from './pages/BookPage';
import { BookingIntroPage } from './pages/BookingIntroPage';
import { EditingPage } from './pages/EditingPage';
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

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Cursor />
          <Toaster />
          <Routes>
            {/* Public */}
            <Route path="/"            element={<HomePage />} />
            <Route path="/login"       element={<LoginPage />} />
            <Route path="/register"    element={<RegisterPage />} />
            <Route path="/service-area" element={<ServiceAreaPage />} />
            <Route path="/book" element={<BookingIntroPage />} />

            {/* Customer (login required) */}
            <Route path="/book/request" element={<ProtectedRoute><BookPage /></ProtectedRoute>} />
            <Route path="/editing"   element={<ProtectedRoute><EditingPage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/messages"  element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />

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
            <Route path="/admin/portfolio" element={
              <ProtectedRoute requireStaff>
                <AdminPortfolio />
              </ProtectedRoute>
            } />
            <Route path="/admin/messages" element={
              <ProtectedRoute requireStaff>
                <AdminMessages />
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
      </NotificationProvider>
    </AuthProvider>
  );
}
