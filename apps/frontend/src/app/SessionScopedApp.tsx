import { useEffect } from 'react';

import { SearchChatsModal } from '../components/common/SearchChatsModal';
import { AppBrandingProvider } from '../context/AppBrandingContext';
import { useAuth } from '../context/AuthContext';
import { RAGChatProvider } from '../context/RAGChatContext';
import { useAppBranding } from '../hooks/useAppBranding';
import { AppRouter } from './AppRouter';

export function SessionScopedApp() {
  const { user, token } = useAuth();
  const { appName } = useAppBranding();
  const sessionScope = user?.user_id ?? token ?? 'anonymous';

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  return (
    <AppBrandingProvider appName={appName}>
      <RAGChatProvider key={String(sessionScope)}>
        <AppRouter />
        <SearchChatsModal />
      </RAGChatProvider>
    </AppBrandingProvider>
  );
}
