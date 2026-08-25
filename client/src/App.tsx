import { Switch, Route, useLocation } from "wouter";
import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompareProvider } from "@/contexts/CompareContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import TeamLoginNotice from "@/components/TeamLoginNotice";
import Home from "@/pages/Home";
import RunDetail from "@/pages/RunDetail";
import Discovery from "@/pages/Discovery";
import AreaDetail from "@/pages/AreaDetail";
import Compare from "@/pages/Compare";
import ContractorDiscovery from "@/pages/ContractorDiscovery";
import About from "@/pages/About";
import FAQ from "@/pages/FAQ";
import HowItWorks from "@/pages/HowItWorks";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import Checkout from "@/pages/Checkout";
import AddressPreview from "@/pages/AddressPreview";
import NotFound from "@/pages/not-found";
import InsightReport from "@/pages/InsightReport";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", fontFamily: "monospace" }}>
          <h1 style={{ fontSize: "18px", marginBottom: "12px" }}>Something went wrong</h1>
          <p style={{ fontSize: "13px", color: "#555", marginBottom: "16px" }}>
            {this.state.error?.message || "Unknown error"}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = "/"; }}
            style={{ padding: "8px 16px", cursor: "pointer", border: "1px solid #000", background: "#fff" }}
          >
            Go home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

// Temporary redesign gate: while the redesign is in progress, any signed-in
// account other than the allowlisted one sees a hold message instead of the app.
const REDESIGN_GATE_ALLOWED = ["test@test.com"];

function RedesignGate({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const blocked = !!user && !REDESIGN_GATE_ALLOWED.includes(user.email.trim().toLowerCase());
  if (!blocked) return <>{children}</>;
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f7f4", padding: "24px" }} data-testid="redesign-gate">
      <div style={{ maxWidth: "460px", textAlign: "center", background: "#fff", border: "1px solid #e5e2db", borderRadius: "12px", padding: "40px 32px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: "34px", marginBottom: "16px" }}>🚧</div>
        <p style={{ fontSize: "17px", lineHeight: 1.6, color: "#1a1a1a", fontWeight: 600, marginBottom: "10px" }}>
          SUKHMIT has decided to redesign the site AGAIN.
        </p>
        <p style={{ fontSize: "15px", lineHeight: 1.6, color: "#555", marginBottom: "24px" }}>
          He'll notify you when it's ready for your feedback.
        </p>
        <button
          onClick={() => { logout().catch(() => {}); }}
          style={{ padding: "9px 20px", fontSize: "13px", cursor: "pointer", border: "1px solid #ccc", borderRadius: "6px", background: "#fff", color: "#333" }}
          data-testid="redesign-gate-logout"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/run/:id" component={RunDetail} />
      <Route path="/report/:id" component={RunDetail} />
      <Route path="/discovery" component={Discovery} />
      <Route path="/contractors" component={ContractorDiscovery} />
      <Route path="/compare" component={Compare} />
      <Route path="/area/zip/:zipCode">
        <AreaDetail type="zip" />
      </Route>
      <Route path="/area/community/:communityId">
        <AreaDetail type="community" />
      </Route>
      <Route path="/about" component={About} />
      <Route path="/faq" component={FAQ} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/preview" component={AddressPreview} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/checkout/success" component={CheckoutSuccess} />
      <Route path="/runs/:id/insight-report" component={InsightReport} />
      <Route path="/report/:id/insight-report" component={InsightReport} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <CompareProvider>
              <ScrollToTop />
              <RedesignGate>
                <Router />
              </RedesignGate>
              <TeamLoginNotice />
              <Toaster />
            </CompareProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
