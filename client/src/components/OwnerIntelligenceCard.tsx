import { ExternalLink, Building2, UserSearch, AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  classifyOwnerName,
  ilSosBusinessSearchUrl,
  cookRecorderByPinUrl,
  cookTreasurerByPinUrl,
  propublicaNonprofitSearchUrl,
} from "@shared/ownerIntel";

interface OwnerIntelligenceCardProps {
  pin: string;
  deedOwnerName: string | null; // grantee of most recent deed / recorder owner
  mailingOwnerName: string | null; // Cook County Treasurer tax-bill name
}

function normalizeForCompare(name: string | null): string {
  return (name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export default function OwnerIntelligenceCard({ pin, deedOwnerName, mailingOwnerName }: OwnerIntelligenceCardProps) {
  const cleanDeedOwner = deedOwnerName?.trim() || null;
  const cleanMailingOwner = mailingOwnerName?.trim() || null;
  const primaryName = cleanDeedOwner || cleanMailingOwner;
  if (!primaryName) return null;

  const cls = classifyOwnerName(primaryName);
  const mailingDiffers =
    !!cleanDeedOwner && !!cleanMailingOwner &&
    normalizeForCompare(cleanDeedOwner) !== normalizeForCompare(cleanMailingOwner) &&
    !normalizeForCompare(cleanMailingOwner).includes(normalizeForCompare(cleanDeedOwner).slice(0, 12));

  const kindBadgeClass =
    cls.kind === "llc" || cls.kind === "corporation"
      ? "bg-indigo-100 text-indigo-900 border-indigo-300"
      : cls.kind === "trust"
        ? "bg-amber-100 text-amber-900 border-amber-300"
        : cls.kind === "bank_or_lender"
          ? "bg-red-100 text-red-900 border-red-300"
          : "";

  const steps: Array<{ label: string; detail: string; href: string | null }> = [];
  if (cls.isBusinessEntity) {
    steps.push({
      label: "IL Secretary of State entity search",
      detail: "Registered agent, managers/members (LLC) or officers (corp). Paste the owner name into the search.",
      href: ilSosBusinessSearchUrl(),
    });
  }
  steps.push({
    label: "Tax bill mailing address",
    detail: "Where the Treasurer sends the bill is often the real owner\u2019s home or office.",
    href: cookTreasurerByPinUrl(pin),
  });
  steps.push({
    label: "Mortgage & deed signature pages",
    detail: "Recorder documents on this PIN are often signed and notarized by a real person, even when an entity holds title.",
    href: cookRecorderByPinUrl(pin),
  });
  if (cls.kind === "nonprofit_or_church") {
    steps.push({
      label: "IRS Form 990 (ProPublica)",
      detail: "Officers and directors of the nonprofit.",
      href: propublicaNonprofitSearchUrl(primaryName),
    });
  }

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--sb-line)", background: "#fff" }} data-testid="card-owner-intelligence">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-jbmono text-[11px] font-bold uppercase tracking-[0.14em] text-[#565651] flex items-center gap-2">
          <UserSearch className="w-4 h-4 text-foreground" />
          Owner Intelligence
        </h4>
        <Badge variant="outline" className={`text-xs ${kindBadgeClass}`} data-testid="badge-owner-kind">
          {cls.kind === "individual" || cls.kind === "unknown" ? null : <Building2 className="w-3 h-3 mr-1" />}
          {cls.label}
        </Badge>
      </div>

      <div className="text-sm space-y-1">
        <div className="break-words">
          <span className="text-muted-foreground">Owner of record:</span>{" "}
          <span className="font-medium" data-testid="text-owner-of-record">{primaryName}</span>
        </div>
        {mailingOwnerName && mailingDiffers && (
          <div className="flex items-start gap-1.5 text-xs rounded-md border px-2 py-1.5 bg-amber-50 border-amber-300 text-amber-900" data-testid="alert-mailing-mismatch">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Tax bill is addressed to <span className="font-semibold">{mailingOwnerName}</span> — differs from the deed. This can signal a recent transfer, a trust, or the person behind the entity.
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{cls.hint}</p>

      {(cls.isBusinessEntity || cls.kind === "trust") && (
        <div className="space-y-1.5">
          {steps.map((s) => (
            <a
              key={s.label}
              href={s.href || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 text-xs rounded-md border px-2.5 py-2 hover-elevate"
              style={{ borderColor: "var(--sb-line)" }}
              data-testid={`link-owner-step-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
              <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <span className="flex-1">
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground"> — {s.detail}</span>
              </span>
              <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
