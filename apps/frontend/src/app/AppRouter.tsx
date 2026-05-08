import { useEffect } from 'react';
import { Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { LoadingState } from '../components/common/LoadingState';
import { useAuth } from '../context/AuthContext';
import { queryClient, queryKeys } from '../lib/queryClient';
import api from '../services/apiClient';
import { AuthenticatedRoutes } from './AuthenticatedRoutes';
import { SetupRoutes } from './SetupRoutes';

export function AppRouter() {
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
    const setupLoading = window.location.pathname === '/setup';
    return (
      <div
        className={
          setupLoading
            ? 'setup-shell-light flex min-h-screen items-center justify-center bg-oracle-bg-gray text-oracle-dark-gray'
            : 'app-shell-dark flex min-h-screen items-center justify-center'
        }
      >
        <LoadingState />
      </div>
    );
  }

  const handleSetupComplete = () => queryClient.setQueryData(queryKeys.setup.check, true);

  return (
    <Routes>
      {!setupDone ? (
        <SetupRoutes onSetupComplete={handleSetupComplete} />
      ) : (
        <AuthenticatedRoutes isAuthenticated={isAuthenticated} />
      )}
    </Routes>
  );
}
