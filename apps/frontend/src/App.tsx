import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { RAGChatProvider } from './context/RAGChatContext';
import { SetupWizard } from './components/wizard/SetupWizard';
import { LoginForm } from './components/auth/LoginForm';
import { Home } from './components/pages/Home';
import { Chat } from './components/pages/Chat';
import { RAG } from './components/pages/RAG';
import { Metadata } from './components/pages/Metadata';
import { Settings } from './components/pages/Settings';
import { Profile } from './components/pages/Profile';
import { Users } from './components/pages/Users';
import { LoadingState } from './components/common/LoadingState';
import { SearchChatsModal } from './components/common/SearchChatsModal';
import { useAppBranding } from './hooks/useAppBranding';
import api from './services/api';
import { queryClient, queryKeys } from './lib/queryClient';
import './styles/oracle-theme.css';

function AppRouter() {
  const { isAuthenticated, loading, logout } = useAuth();
  const { data: setupCompleted, isPending: setupPending } = useQuery({
    queryKey: queryKeys.setup.check,
    queryFn: async () => {
      try {
        const res = await api.get('/setup/check', { timeout: 10000 });
        return res.data.completed === true;
      } catch {
        return false;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  const setupDone = setupCompleted === true;
  const showSpinner = loading || setupPending;

  useEffect(() => {
    if (!setupPending && !setupDone && setupCompleted === false) logout();
  }, [setupPending, setupDone, setupCompleted, logout]);

  if (showSpinner) {
    return (
      <div className="app-shell-dark min-h-screen flex items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  const handleSetupComplete = () => queryClient.setQueryData(queryKeys.setup.check, true);

  return (
    <Routes>
      {!setupDone ? (
        <>
          <Route path="/setup" element={<SetupWizard onSetupComplete={handleSetupComplete} />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </>
      ) : (
        <>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/home" element={isAuthenticated ? <Home /> : <Navigate to="/login" replace />} />
          <Route path="/chat" element={isAuthenticated ? <Chat /> : <Navigate to="/login" replace />} />
          <Route path="/rag" element={isAuthenticated ? <RAG /> : <Navigate to="/login" replace />} />
          <Route path="/metadata" element={isAuthenticated ? <Metadata /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={isAuthenticated ? <Profile /> : <Navigate to="/login" replace />} />
          <Route
            path="/users"
            element={isAuthenticated ? <Users /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/settings"
            element={isAuthenticated ? <Settings /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to={isAuthenticated ? '/home' : '/login'} replace />} />
        </>
      )}
    </Routes>
  );
}

function SessionScopedApp() {
  const { user, token } = useAuth();
  const { appName } = useAppBranding();
  const sessionScope = user?.user_id ?? token ?? 'anonymous';

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  return (
    <RAGChatProvider key={String(sessionScope)}>
      <AppRouter />
      <SearchChatsModal />
    </RAGChatProvider>
  );
}

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <ToastProvider>
          <SessionScopedApp />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
