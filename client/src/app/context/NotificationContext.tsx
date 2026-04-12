import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useNotifications } from '../hooks/useNotifications';

interface NotificationContextType {
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType>({ unreadCount: 0 });

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { unreadCount } = useNotifications(token);

  return (
    <NotificationContext.Provider value={{ unreadCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  return useContext(NotificationContext);
}
