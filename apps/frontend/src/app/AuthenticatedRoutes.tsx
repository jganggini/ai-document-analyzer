import { Navigate, Route } from 'react-router-dom';

import { LoginForm } from '../components/auth/LoginForm';
import { Chat } from '../components/pages/Chat';
import { ContinuousImprovement } from '../components/pages/ContinuousImprovement';
import { Home } from '../components/pages/Home';
import { Metadata } from '../components/pages/Metadata';
import { Profile } from '../components/pages/Profile';
import { RAG } from '../components/pages/RAG';
import { Settings } from '../components/pages/Settings';
import { Users } from '../components/pages/Users';

type AuthenticatedRoutesProps = {
  isAuthenticated: boolean;
};

function protectedElement(isAuthenticated: boolean, element: JSX.Element): JSX.Element {
  return isAuthenticated ? element : <Navigate to="/login" replace />;
}

export function AuthenticatedRoutes({ isAuthenticated }: AuthenticatedRoutesProps) {
  return (
    <>
      <Route path="/login" element={<LoginForm />} />
      <Route path="/home" element={protectedElement(isAuthenticated, <Home />)} />
      <Route path="/chat" element={protectedElement(isAuthenticated, <Chat />)} />
      <Route path="/rag" element={protectedElement(isAuthenticated, <RAG />)} />
      <Route
        path="/observability"
        element={protectedElement(isAuthenticated, <ContinuousImprovement />)}
      />
      <Route path="/improvement" element={<Navigate to="/observability" replace />} />
      <Route path="/metadata" element={protectedElement(isAuthenticated, <Metadata />)} />
      <Route path="/profile" element={protectedElement(isAuthenticated, <Profile />)} />
      <Route path="/users" element={protectedElement(isAuthenticated, <Users />)} />
      <Route path="/settings" element={protectedElement(isAuthenticated, <Settings />)} />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/home' : '/login'} replace />} />
    </>
  );
}
