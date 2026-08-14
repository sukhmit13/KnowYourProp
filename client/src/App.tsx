import { Switch, Route, useLocation } from "wouter";
import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompareProvider } from "@/contexts/CompareContext";
import { AuthProvider } from "@/contexts/AuthContext";
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
              <Router />
              <Toaster />
            </CompareProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
