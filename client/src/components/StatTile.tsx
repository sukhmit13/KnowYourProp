import type React from "react";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  qualifier?: React.ReactNode;
  color?: string;
  className?: string;
  "data-testid"?: string;
}

export function StatTile({ label, value, qualifier, color, className, ...props }: StatTileProps) {
  return (
    <div className={cn("stat-tile", className)} {...props}>
      <div className="stat-tile__left">
        <div className="stat-tile__label">
          {color && <span className="stat-tile__dot" style={{ backgroundColor: color }} aria-hidden="true" />}
          <span>{label}</span>
        </div>
        {qualifier && <div className="stat-tile__qualifier">{qualifier}</div>}
      </div>
      <div className="stat-tile__value">{value}</div>
    </div>
  );
}

export default StatTile;