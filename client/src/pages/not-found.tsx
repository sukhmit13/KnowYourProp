import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center px-6">
        <p className="text-xs font-mono text-muted-foreground mb-3 tracking-widest uppercase">404</p>
        <h1 className="text-2xl font-bold font-mono text-foreground mb-2">This page doesn't exist</h1>
        <p className="text-sm text-muted-foreground mb-8">The link may be broken or the page may have been removed.</p>
        <Link
          href="/"
          className="inline-block border border-border bg-foreground text-background px-5 py-2 text-sm font-mono hover:opacity-80 transition-opacity"
          data-testid="link-return-home"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
