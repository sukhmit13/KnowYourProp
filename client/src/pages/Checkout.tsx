import { useCallback, useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";

export default function Checkout() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const type = params.get("type") || "report";
  const runId = params.get("runId");
  const address = params.get("address");
  const email = params.get("email");
  const { user } = useAuth();

  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("checkout_viewed", { product: type === "subscription" ? "subscription" : "report" });
    fetch("/api/stripe/config")
      .then((r) => r.json())
      .then(({ publishableKey }) => {
        if (publishableKey) {
          setStripePromise(loadStripe(publishableKey));
        } else {
          setError("Payment configuration is unavailable. Please contact support.");
        }
      })
      .catch(() => setError("Could not load payment system. Please try again."));
  }, []);

  const fetchClientSecret = useCallback(async () => {
    const endpoint =
      type === "subscription"
        ? "/api/stripe/checkout/subscription/embedded"
        : "/api/stripe/checkout/report/embedded";

    const resolvedEmail = email || user?.email || undefined;
    const body =
      type === "subscription"
        ? { email: resolvedEmail }
        : { address: address || undefined, runId: runId ? Number(runId) : undefined, email: resolvedEmail };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      trackEvent("checkout_init_failed", {
        product: type === "subscription" ? "subscription" : "report",
        status: res.status,
      });
      throw new Error("Could not initialize checkout. Please try again.");
    }

    const data = await res.json();
    trackEvent("checkout_initialized", {
      product: type === "subscription" ? "subscription" : "report",
    });
    return data.clientSecret as string;
  }, [type, runId, address, email, user?.email]);

  return (
    <div className="min-h-screen bg-background text-foreground font-body flex flex-col">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="font-display text-xl font-bold tracking-widest text-foreground uppercase"
          data-testid="link-home-logo"
        >
          KNOW YOUR PROPERTY
        </button>
        <button
          onClick={() => window.history.back()}
          className="text-xs font-display uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back"
        >
          ← Back
        </button>
      </div>

      <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2 font-body">
            {type === "subscription" ? "Subscription" : "Single Report"}
          </p>
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight">
            {type === "subscription" ? "Subscribe — $99 / month" : "Purchase Report — $29"}
          </h1>
          {address && type === "report" && (
            <p className="text-sm text-muted-foreground mt-2 font-body">{decodeURIComponent(address)}</p>
          )}
        </div>

        {error ? (
          <div className="border border-red-500 p-4 text-sm text-red-600 font-body">{error}</div>
        ) : stripePromise ? (
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        ) : (
          <div className="flex items-center gap-3 text-sm text-muted-foreground font-body py-8">
            <span className="inline-block w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
            Loading payment form...
          </div>
        )}
      </div>
    </div>
  );
}
