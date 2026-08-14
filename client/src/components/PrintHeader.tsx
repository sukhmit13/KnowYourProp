import { format } from "date-fns";

interface PrintHeaderProps {
  title?: string;
  addresses?: string[];
  projectTypes?: (string | null)[];
}

export function PrintHeader({ title = "Property Analysis Report", addresses = [], projectTypes = [] }: PrintHeaderProps) {
  const currentDate = format(new Date(), "MMMM d, yyyy 'at' h:mm a");
  
  return (
    <div className="print-header hidden print:flex">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        Chicago Eligibility Screener
      </div>
      <h1>{title}</h1>
      <div className="print-date">Generated on {currentDate}</div>
      {addresses.length > 0 && (
        <div className="mt-2 space-y-1">
          {addresses.map((address, idx) => (
            <div key={idx} className="print-address">
              {address}
              {projectTypes[idx] && (
                <span className="ml-2 text-sm text-muted-foreground">
                  ({projectTypes[idx]})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
