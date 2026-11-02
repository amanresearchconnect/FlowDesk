import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Inbox } from './pages/Inbox';
import { Campaigns } from './pages/Campaigns';
import { Contacts } from './pages/Contacts';
import { Workflows } from './pages/Workflows';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { Integrations } from './pages/Integrations';

// Protected Route Guard
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/inbox" replace />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="workflows" element={<Workflows />} />
        <Route path="knowledge-base" element={<KnowledgeBase />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="*" element={<Navigate to="/inbox" replace />} />
      </Route>
    </Routes>
  );
};
