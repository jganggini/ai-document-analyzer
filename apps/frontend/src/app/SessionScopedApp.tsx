import { useEffect } from 'react';

import { SearchChatsModal } from '../components/common/SearchChatsModal';
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
    <RAGChatProvider key={String(sessionScope)}>
      <AppRouter />
      <SearchChatsModal />
    </RAGChatProvider>
  );
}
