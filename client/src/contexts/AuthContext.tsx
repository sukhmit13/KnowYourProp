import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

const TOKEN_KEY = "kyp_auth_token";

interface AuthUser {
  id: number;
  email: string;
  plan: string;
  trialReportsRemaining: number | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isSubscriber: boolean;
  isSingleReport: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, stripeCustomerId?: string, stripeSubscriptionId?: string, plan?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Google OAuth return: token arrives in the URL hash (never sent to the
    // server). Store it, clean the URL, then continue with the session check.
    try {
      const m = window.location.hash.match(/oauth_token=([a-f0-9]{64})/);
      if (m) {
        localStorage.setItem(TOKEN_KEY, m[1]);
        setToken(m[1]);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch {}
    let cancelled = false;
    const checkSession = () => {
      const headers: Record<string, string> = {};
      const storedToken = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })();
      if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
      fetch("/api/auth/me", { credentials: "include", headers })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled) return;
          if (data) {
            setUser({ id: data.id, email: data.email, plan: data.plan, trialReportsRemaining: data.trialReportsRemaining ?? null });
          } else {
            // Session invalid — e.g. this account logged in on another device
            // (single active session per account). Clear local auth state.
            setUser(null);
            setToken(null);
            try { localStorage.removeItem(TOKEN_KEY); } catch {}
          }
        })
        .catch(() => { /* network hiccup — keep current state */ })
        .finally(() => { if (!cancelled) setIsLoading(false); });
    };
    checkSession();
    // Re-verify when the tab regains focus so a device that was signed out
    // remotely (login elsewhere) drops its session promptly.
    const onFocus = () => checkSession();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeAuth = (data: AuthUser & { token?: string }) => {
    setUser({ id: data.id, email: data.email, plan: data.plan, trialReportsRemaining: data.trialReportsRemaining ?? null });
    if (data.token) {
      setToken(data.token);
      try { localStorage.setItem(TOKEN_KEY, data.token); } catch {}
    }
  };

  const login = async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed.");
    storeAuth(data);
  };

  const register = async (email: string, password: string, stripeCustomerId?: string, stripeSubscriptionId?: string, plan?: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { email, password, stripeCustomerId, stripeSubscriptionId, plan });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed.");
    storeAuth(data);
  };

  const logout = async () => {
    await apiRequest("POST", "/api/auth/logout", {});
    setUser(null);
    setToken(null);
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isSubscriber: user?.plan === "subscriber",
      isSingleReport: user?.plan === "single_report",
      login,
      register,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
