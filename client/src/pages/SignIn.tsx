import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function SignIn() {
  const [, navigate] = useLocation();
  const { login, register } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Surface Google sign-in errors bounced back via the URL hash
  useEffect(() => {
    const m = window.location.hash.match(/oauth_error=([^&]+)/);
    if (m) {
      toast({ title: decodeURIComponent(m[1]), variant: "destructive" });
      history.replaceState(null, "", window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      toast({ title: "Passwords do not match.", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === "signin") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate("/");
    } catch (err: any) {
      toast({ title: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-body flex flex-col">
      <div className="border-b-2 border-black px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="font-display text-xl font-bold tracking-widest text-black uppercase"
          data-testid="link-home"
        >
          KNOW YOUR PROPERTY
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-2 font-body">
            Subscriber Access
          </p>
          <h1 className="font-display text-2xl font-bold text-black uppercase tracking-tight mb-8">
            {mode === "signin" ? "Sign In" : "Create Account"}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-0">
            <div className="border-2 border-black">
              <div className="border-b border-black">
                <label className="block px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-gray-400 font-body">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 pb-3 text-sm font-body text-black bg-white outline-none placeholder-gray-300"
                  placeholder="you@example.com"
                  data-testid="input-email"
                  autoComplete="email"
                />
              </div>
              <div className={mode === "register" ? "border-b border-black" : ""}>
                <label className="block px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-gray-400 font-body">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 pb-3 text-sm font-body text-black bg-white outline-none placeholder-gray-300"
                  placeholder="••••••••"
                  data-testid="input-password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>
              {mode === "register" && (
                <div>
                  <label className="block px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-gray-400 font-body">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 pb-3 text-sm font-body text-black bg-white outline-none placeholder-gray-300"
                    placeholder="••••••••"
                    data-testid="input-confirm-password"
                    autoComplete="new-password"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-black text-white font-display text-sm uppercase tracking-widest py-4 hover:bg-gray-900 transition-colors disabled:opacity-50 mt-4"
              data-testid="button-submit-auth"
            >
              {isSubmitting
                ? mode === "signin" ? "Signing In..." : "Creating Account..."
                : mode === "signin" ? "Sign In →" : "Create Account →"}
            </button>
          </form>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-body">or</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <a
            href="/api/auth/google"
            className="mt-4 w-full flex items-center justify-center gap-3 border-2 border-black bg-white text-black font-display text-sm uppercase tracking-widest py-4 hover:bg-gray-50 transition-colors"
            data-testid="button-google-signin"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Sign in with Google
          </a>

          <div className="mt-6 text-center">
            {mode === "signin" ? (
              <p className="text-xs font-body text-gray-500">
                Don't have an account?{" "}
                <button
                  onClick={() => setMode("register")}
                  className="text-black font-bold underline"
                  data-testid="link-switch-register"
                >
                  Create one
                </button>
              </p>
            ) : (
              <p className="text-xs font-body text-gray-500">
                Already have an account?{" "}
                <button
                  onClick={() => setMode("signin")}
                  className="text-black font-bold underline"
                  data-testid="link-switch-signin"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>

          {mode === "signin" && (
            <p className="mt-8 text-[11px] font-body text-gray-400 text-center leading-relaxed">
              Subscriber accounts give you unlimited reports, saved history, and property comparison.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
