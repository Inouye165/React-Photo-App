import type React from 'react';

export type AuthActionResult =
  | { success: true; data?: unknown }
  | { success: false; error: string };

export interface AuthContextValue {
  user: unknown | null;
  session: unknown | null;
  loading: boolean;
  authReady: boolean;
  cookieReady: boolean;
  preferences: unknown;
  updatePreferences: (newPrefs: unknown) => Promise<AuthActionResult>;
  loadDefaultScales: (categories?: unknown) => Promise<AuthActionResult>;
  login: (email: string, password: string) => Promise<AuthActionResult>;
  register: (email: string, password: string, username?: string) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  signInWithPhone: (phone: string) => Promise<AuthActionResult>;
  verifyPhoneOtp: (phone: string, otp: string) => Promise<AuthActionResult>;
  resetPassword: (email: string) => Promise<AuthActionResult>;
  updatePassword: (newPassword: string) => Promise<AuthActionResult>;
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
