import { create } from 'zustand';
import { api } from '../lib/api.js';
import { connectSocket, disconnectSocket } from '../lib/socket.js';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'agent';
}

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  init: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  init: () => {
    try {
      const storedToken = localStorage.getItem('flowdesk_token');
      const storedUser = localStorage.getItem('flowdesk_user');

      if (storedToken && storedUser) {
        const user = JSON.parse(storedUser);
        connectSocket(storedToken);
        set({
          token: storedToken,
          user,
          isAuthenticated: true,
          isLoading: false
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post('/auth/login', { email, password });
      const { user, accessToken } = res.data;

      localStorage.setItem('flowdesk_token', accessToken);
      localStorage.setItem('flowdesk_user', JSON.stringify(user));

      connectSocket(accessToken);

      set({
        user,
        token: accessToken,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.message || 'Login failed'
      });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('flowdesk_token');
    localStorage.removeItem('flowdesk_user');
    disconnectSocket();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    });
  }
}));
