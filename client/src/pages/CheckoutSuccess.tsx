import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

export default function CheckoutSuccess() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("session_id");
  const { user, register } = useAuth();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/stripe/session", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const res = await fetch(`/api/stripe/session/${sessionId}`);
      return res.json();
    },
    enabled: !!sessionId,
    retry: false,
  });

  const isSubscription = data?.mode === "subscription";
  const customerEmail = data?.customerEmail || "";
  const purchasedRunId = data?.runId ? Number(data.runId) : null;
  const purchasedAddress = data?.address || null;

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match.", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      await register(customerEmail, password, data?.stripeCustomerId, data?.stripeSubscriptionId);
      setAccountCreated(true);
      toast({ title: "Account created — you're signed in." });
    } catch (err: any) {
      toast({ title: err.message || "Could not create account.", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const AccountForm = ({ required }: { required: boolean }) => (
    <form onSubmit={handleCreateAccount} className="space-y-0">
      <div className="border border-black mb-3">
        <div className="border-b border-black px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-body mb-1">Email</p>
          <p className="text-sm font-body text-black">{customerEmail}</p>
        </div>
        <div className="border-b border-black">
          <label className="block px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-widest text-gray-400 font-body">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 pb-2 text-sm font-body text-black bg-white outline-none"
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            data-testid="input-password"
          />
        </div>
        <div>
          <label className="block px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-widest text-gray-400 font-body">
            Confirm Password
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 pb-2 text-sm font-body text-black bg-white outline-none"
            placeholder="••••••••"
            autoComplete="new-password"
            data-testid="input-confirm-password"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={isCreating}
        className="w-full bg-black text-white font-display text-sm uppercase tracking-widest py-3 hover:bg-gray-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        data-testid="button-create-account"
      >
        {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
        {isCreating ? "Creating Account..." : required ? "Create Account →" : "Save to Account →"}
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-white font-body flex flex-col">
      <div className="border-b border-black px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="font-display text-xl font-bold tracking-widest text-black uppercase"
        >
          KNOW YOUR PROPERTY
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full">
          {isLoading ? (
            <p className="text-sm font-body text-gray-500 text-center">Verifying payment...</p>
          ) : (
            <>
              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-black flex items-center justify-center mx-auto mb-6">
                  <span className="text-white text-2xl">✓</span>
                </div>
                <h1 className="font-display text-3xl font-bold text-black uppercase tracking-tight mb-3">
                  Payment Confirmed
                </h1>

                {isSubscription ? (
                  <p className="text-sm font-body text-gray-600">
                    Your subscription is active. You now have unlimited access to KNOW YOUR PROPERTY reports.
                  </p>
                ) : (
                  <>
                    {purchasedAddress && (
                      <p className="text-sm font-body text-gray-700 font-semibold mb-3">{purchasedAddress}</p>
                    )}
                    <div className="flex items-center justify-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <p className="text-sm font-body text-gray-600">
                        Report link sent to{" "}
                        <span className="font-semibold text-black">{customerEmail}</span>
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* === SUBSCRIPTION FLOW: must create account === */}
              {isSubscription && !user && !accountCreated && customerEmail && (
                <div className="border-2 border-black p-6 mb-6">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 mb-1 font-body">
                    Set up your account
                  </p>
                  <p className="text-sm font-body text-black font-bold mb-4">
                    Create a password to sign in to your subscription from any device.
                  </p>
                  <AccountForm required={true} />
                </div>
              )}

              {/* === SINGLE REPORT FLOW: optional account === */}
              {!isSubscription && !user && !accountCreated && customerEmail && (
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={() => setShowAccountForm((v) => !v)}
                    className="w-full flex items-center justify-between border border-black px-4 py-3 text-sm font-body text-black hover:bg-gray-50 transition-colors"
                    data-testid="button-toggle-account"
                  >
                    <span>
                      <span className="font-semibold">Create a free account</span>
                      <span className="text-gray-500 ml-2">— save report to your history</span>
                    </span>
                    {showAccountForm ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  {showAccountForm && (
                    <div className="border border-t-0 border-black px-4 pt-4 pb-4">
                      <AccountForm required={false} />
                    </div>
                  )}
                </div>
              )}

              {/* Signed-in confirmation */}
              {(accountCreated || user) && (
                <div className="border border-black p-4 mb-6 flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-black flex-shrink-0" />
                  <p className="text-sm font-body text-black">
                    Signed in as <span className="font-bold">{user?.email || customerEmail}</span>
                  </p>
                </div>
              )}

              {/* Primary CTA */}
              {isSubscription ? (
                <button
                  onClick={() => navigate("/")}
                  className="w-full bg-black text-white font-display text-sm uppercase tracking-widest px-8 py-3 hover:bg-gray-800 transition-colors"
                  data-testid="button-run-analysis"
                >
                  Run Property Analysis →
                </button>
              ) : purchasedRunId ? (
                <div className="space-y-3">
                  {(accountCreated || user) ? (
                    <>
                      <button
                        onClick={() => {
                          sessionStorage.setItem('showFunnelOnLoad', 'true');
                          navigate(`/run/${purchasedRunId}`);
                        }}
                        className="w-full bg-black text-white font-display text-sm uppercase tracking-widest px-8 py-3 hover:bg-gray-800 transition-colors"
                        data-testid="button-view-in-sidebar"
                      >
                        Open Your Report →
                      </button>
                      <button
                        onClick={() => navigate(`/report/${purchasedRunId}`)}
                        className="w-full border border-black text-black font-display text-xs uppercase tracking-widest px-8 py-2.5 hover:bg-gray-50 transition-colors"
                        data-testid="button-view-report"
                      >
                        Open as Shareable Link →
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => navigate(`/report/${purchasedRunId}`)}
                      className="w-full bg-black text-white font-display text-sm uppercase tracking-widest px-8 py-3 hover:bg-gray-800 transition-colors"
                      data-testid="button-view-report"
                    >
                      Open Your Report →
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => navigate("/")}
                  className="w-full bg-black text-white font-display text-sm uppercase tracking-widest px-8 py-3 hover:bg-gray-800 transition-colors"
                  data-testid="button-run-analysis"
                >
                  Run Property Analysis →
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
