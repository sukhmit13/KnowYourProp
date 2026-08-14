import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Lock } from "lucide-react";

interface SubscriberGateProps {
  featureName: string;
}

export function SubscriberGate({ featureName }: SubscriberGateProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 bg-[#2b3a9e] rounded-[10px] flex items-center justify-center mx-auto mb-6">
          <Lock className="w-6 h-6 text-white" />
        </div>
        <p className="font-jbmono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b8a84] mb-2">
          Subscriber Feature
        </p>
        <h1 className="font-jbmono text-xl font-bold text-foreground uppercase tracking-[0.06em] mb-3">
          {featureName}
        </h1>
        <p className="text-sm font-body text-muted-foreground mb-8 leading-relaxed">
          {user
            ? "This feature is available to monthly subscribers. Upgrade your plan to unlock unlimited reports, saved history, and full access to market intelligence tools."
            : "This feature is available to monthly subscribers. Sign up for $99/month to unlock unlimited reports, saved history, and market intelligence tools."}
        </p>
        <div className="space-y-3">
          <button
            onClick={() => setLocation("/")}
            className="w-full bg-[#2b3a9e] text-white font-jbmono text-xs font-bold uppercase tracking-[0.12em] py-3 rounded-[10px] hover:bg-[#3446bd] transition-colors"
            data-testid="button-gate-subscribe"
          >
            View Plans — $99 / Month
          </button>
          <button
            onClick={() => setLocation("/")}
            className="w-full border border-[#ddd9d0] text-foreground font-body text-sm py-3 rounded-[10px] hover:border-[#2b3a9e] hover:text-[#2b3a9e] transition-colors"
            data-testid="button-gate-back"
          >
            ← Back to Home
          </button>
        </div>
        {!user && (
          <p className="text-[11px] text-muted-foreground font-body mt-6">
            Already a subscriber?{" "}
            <button
              onClick={() => setLocation("/")}
              className="underline hover:text-[#2b3a9e] transition-colors"
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
