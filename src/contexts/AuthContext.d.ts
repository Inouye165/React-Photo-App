import type React from 'react';

export type AuthActionResult =
  | { success: true; data?: unknown }
  | { success: false; error: string };

export interface AuthContextValue {
  user: unknown | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthActionResult>;
  resetPassword: (email: string) => Promise<AuthActionResult>;
}

declare module '../contexts/AuthContext' {
  export const useAuth: () => AuthContextValue;
  export const AuthProvider: React.FC<{ children: React.ReactNode }>;
}

declare module '../contexts/AuthContext.jsx' {
  export const useAuth: () => AuthContextValue;
  export const AuthProvider: React.FC<{ children: React.ReactNode }>;
}

declare module './contexts/AuthContext' {
  export const useAuth: () => AuthContextValue;
  export const AuthProvider: React.FC<{ children: React.ReactNode }>;
}

declare module './contexts/AuthContext.jsx' {
  export const useAuth: () => AuthContextValue;
  export const AuthProvider: React.FC<{ children: React.ReactNode }>;
}
