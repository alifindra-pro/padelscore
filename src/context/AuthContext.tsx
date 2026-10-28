"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { apiFetch } from "@/lib/api-client";
import { UserResponse } from "@/types";

interface AuthContextType {
  user: UserResponse | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<UserResponse>;
  register: (data: {
    email: string;
    username: string;
    password: string;
    fullName: string;
  }) => Promise<UserResponse>;
  loginWithButton: () => Promise<UserResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = async () => {
    try {
      const data = await apiFetch<{ user: UserResponse }>("/api/v1/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    apiFetch<{ user: UserResponse }>("/api/v1/auth/me")
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiFetch<{ user: UserResponse }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    return data.user;
  };

  const loginWithButton = async () => {
    const data = await apiFetch<{ user: UserResponse }>(
      "/api/v1/auth/quick-login",
      { method: "POST" },
    );
    setUser(data.user);
    return data.user;
  };

  const register = async (payload: {
    email: string;
    username: string;
    password: string;
    fullName: string;
  }) => {
    const data = await apiFetch<{ user: UserResponse }>(
      "/api/v1/auth/register",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        loginWithButton,
        register,
        logout,
        refresh: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
