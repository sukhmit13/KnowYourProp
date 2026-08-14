import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export function LandingHeader() {
  const [, setLocation] = useLocation();
  const { user, login, register, logout } = useAuth();
  const { toast } = useToast();

  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "register">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirm, setAuthConfirm] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const authPanelRef = useRef<HTMLDivElement>(null);

  // Surface Google sign-in errors bounced back via the URL hash
  useEffect(() => {
    const m = window.location.hash.match(/oauth_error=([^&]+)/);
    if (m) {
      toast({ title: decodeURIComponent(m[1]), variant: "destructive" });
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (authPanelRef.current && !authPanelRef.current.contains(e.target as Node)) {
        setShowAuthPanel(false);
      }
    };
    if (showAuthPanel) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAuthPanel]);

  const redirectAfterSignIn = async () => {
    try {
      // Account-level recency: always open the newest search on the account,
      // regardless of which device it was made from.
      const res = await fetch("/api/runs", { credentials: "include" });
      if (!res.ok) { setLocation("/"); return; }
      const runs = await res.json();
      if (Array.isArray(runs) && runs.length > 0) {
        const sorted = runs.slice().sort((a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        setLocation(`/run/${sorted[0].id}`);
      } else {
        setLocation("/");
      }
    } catch {
      setLocation("/");
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === "register" && authPassword !== authConfirm) {
      toast({ title: "Passwords do not match.", variant: "destructive" });
      return;
    }
    if (authPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setAuthSubmitting(true);
    try {
      if (authMode === "signin") {
        await login(authEmail, authPassword);
        setAuthEmail(""); setAuthPassword(""); setAuthConfirm("");
        setShowAuthPanel(false);
        toast({ title: "Signed in." });
        await redirectAfterSignIn();
      } else {
        await register(authEmail, authPassword);
        setAuthEmail(""); setAuthPassword(""); setAuthConfirm("");
        setShowAuthPanel(false);
        toast({ title: "Account created." });
      }
    } catch (err: any) {
      toast({ title: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setAuthSubmitting(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md [backdrop-filter:saturate(1.3)_blur(12px)] border-b [border-color:#eae8e2] no-print">
      <div className="relative flex items-center justify-between px-6 h-16">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="shrink-0" />
          <h1 className="font-serif text-lg text-[#141414] tracking-[-0.02em] leading-none">KnowYourProp</h1>
        </Link>

        <nav className="hidden md:flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
          <Link href="/how-it-works" className="text-sm font-medium font-body text-[#565651] hover:text-[#141414] hover:bg-black/[.045] px-3 py-1.5 rounded-lg transition-colors">How It Works</Link>
          <Link href="/about" className="text-sm font-medium font-body text-[#565651] hover:text-[#141414] hover:bg-black/[.045] px-3 py-1.5 rounded-lg transition-colors">About</Link>
          <Link href="/faq" className="text-sm font-medium font-body text-[#565651] hover:text-[#141414] hover:bg-black/[.045] px-3 py-1.5 rounded-lg transition-colors">FAQ</Link>
        </nav>

        <div className="relative" ref={authPanelRef}>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-body text-[#8b8a84] hidden sm:block">
                {user.email}
                {user.plan === "subscriber" && <span className="ml-1 font-bold text-[#141414]">· Sub</span>}
              </span>
              <button
                onClick={async () => { await logout(); window.location.href = '/'; }}
                className="text-sm font-semibold font-body text-[#141414] bg-white border [border-color:#ddd9d0] hover:[border-color:#141414] rounded-[10px] px-4 py-2 transition-colors"
                data-testid="button-signout"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowAuthPanel(!showAuthPanel)}
                className="text-sm font-semibold font-body text-[#141414] bg-white border [border-color:#ddd9d0] hover:[border-color:#141414] rounded-[10px] px-4 py-2 transition-colors"
                data-testid="button-open-signin"
              >
                Sign In
              </button>
              {showAuthPanel && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white border [border-color:#ddd9d0] rounded-xl z-50 [box-shadow:0_20px_46px_rgba(20,20,20,.14),0_6px_16px_rgba(20,20,20,.08)] overflow-hidden">
                  <div className="p-4 border-b border-foreground/10 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-body mb-0.5">Subscriber Access</p>
                      <p className="text-sm font-display font-bold text-foreground uppercase tracking-tight">
                        {authMode === "signin" ? "Sign In" : "Create Account"}
                      </p>
                    </div>
                    <button
                      onClick={() => setAuthMode(authMode === "signin" ? "register" : "signin")}
                      className="text-[10px] font-body uppercase tracking-widest text-muted-foreground hover:text-foreground underline"
                    >
                      {authMode === "signin" ? "Register" : "Sign in"}
                    </button>
                  </div>
                  <form onSubmit={handleAuthSubmit} className="p-4 space-y-3">
                    <div className="border [border-color:#ddd9d0] rounded-lg">
                      <label className="block px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-widest text-muted-foreground font-body">Email</label>
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        className="w-full px-3 pb-2 text-sm font-body text-foreground bg-background outline-none"
                        placeholder="you@example.com"
                        autoComplete="email"
                        data-testid="input-auth-email"
                      />
                    </div>
                    <div className="border [border-color:#ddd9d0] rounded-lg">
                      <label className="block px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-widest text-muted-foreground font-body">Password</label>
                      <input
                        type="password"
                        required
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        className="w-full px-3 pb-2 text-sm font-body text-foreground bg-background outline-none"
                        placeholder="••••••••"
                        autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                        data-testid="input-auth-password"
                      />
                    </div>
                    {authMode === "register" && (
                      <div className="border [border-color:#ddd9d0] rounded-lg">
                        <label className="block px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-widest text-muted-foreground font-body">Confirm</label>
                        <input
                          type="password"
                          required
                          value={authConfirm}
                          onChange={(e) => setAuthConfirm(e.target.value)}
                          className="w-full px-3 pb-2 text-sm font-body text-foreground bg-background outline-none"
                          placeholder="••••••••"
                          autoComplete="new-password"
                          data-testid="input-auth-confirm"
                        />
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="w-full bg-[#2b3a9e] text-white font-body font-semibold text-sm rounded-[10px] py-3 hover:bg-[#3446bd] transition-colors disabled:opacity-50"
                      data-testid="button-auth-submit"
                    >
                      {authSubmitting ? "..." : authMode === "signin" ? "Sign In →" : "Create Account →"}
                    </button>
                  </form>
                  <div className="px-4 pb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 border-t [border-color:#eae8e2]" />
                      <span className="text-[10px] uppercase tracking-widest text-[#8b8a84] font-body">or</span>
                      <div className="flex-1 border-t [border-color:#eae8e2]" />
                    </div>
                    <GoogleSignInButton />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
