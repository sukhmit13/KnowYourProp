import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Printer, FileDown, Sparkles } from "lucide-react";

export interface PrintSection {
  id: string;
  label: string;
  defaultChecked?: boolean;
  level?: number;
  group?: string;
  requiresProjectType?: string[];
}

interface PrintSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: PrintSection[];
  onPrint: (selectedSections: string[]) => void;
  /** When provided (and insightEnabled), shows a "Generate Project Insight & Print" option */
  onPrintWithInsight?: (selectedSections: string[]) => void;
  insightEnabled?: boolean;
  projectType?: string | null;
}

export function PrintSettingsDialog({ open, onOpenChange, sections, onPrint, onPrintWithInsight, insightEnabled, projectType }: PrintSettingsDialogProps) {
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());

  const filteredSections = useMemo(() => {
    return sections.filter(s => {
      if (!s.requiresProjectType) return true;
      if (!projectType) return false;
      return s.requiresProjectType.includes(projectType);
    });
  }, [sections, projectType]);

  const groupedSections = useMemo(() => {
    const groups: { groupLabel: string; items: PrintSection[] }[] = [];
    const seen = new Set<string>();
    for (const section of filteredSections) {
      const g = section.group || '';
      if (!seen.has(g)) {
        seen.add(g);
        groups.push({ groupLabel: g, items: [] });
      }
      groups.find(gr => gr.groupLabel === g)!.items.push(section);
    }
    return groups.filter(g => g.items.length > 0);
  }, [filteredSections]);

  useEffect(() => {
    if (open) {
      const defaultSelected = new Set(
        filteredSections.filter(s => s.defaultChecked !== false).map(s => s.id)
      );
      setSelectedSections(defaultSelected);
    }
  }, [open, filteredSections]);

  const toggleSection = (id: string) => {
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleGroup = (items: PrintSection[]) => {
    const allChecked = items.every(s => selectedSections.has(s.id));
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (allChecked) {
        items.forEach(s => next.delete(s.id));
      } else {
        items.forEach(s => next.add(s.id));
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSections(new Set(filteredSections.map(s => s.id)));
  };

  const deselectAll = () => {
    setSelectedSections(new Set());
  };

  const handlePrint = () => {
    onPrint(Array.from(selectedSections));
    onOpenChange(false);
  };

  const handleInsightPrint = () => {
    onPrintWithInsight?.(Array.from(selectedSections));
    onOpenChange(false);
  };

  const selectedCount = selectedSections.size;
  const totalCount = filteredSections.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg no-print">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="w-5 h-5" />
            Print / Save as PDF
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted border border-border px-3 py-2 text-xs text-muted-foreground leading-relaxed">
          To save as PDF: click <span className="font-semibold text-foreground">Print / Save PDF</span> below, then in your browser's print dialog change the <span className="font-semibold text-foreground">Destination</span> to <span className="font-semibold text-foreground">"Save as PDF"</span>.
        </div>

        <div className="py-1">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Sections to include:</span>
              <Badge variant="outline" className="text-xs tabular-nums">
                {selectedCount} / {totalCount}
              </Badge>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={selectAll} data-testid="button-print-select-all">
                Select All
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={deselectAll} data-testid="button-print-deselect-all">
                Deselect All
              </Button>
            </div>
          </div>

          <div className="space-y-0 max-h-[440px] overflow-y-auto pr-1">
            {groupedSections.map(({ groupLabel, items }) => {
              const groupCheckedCount = items.filter(s => selectedSections.has(s.id)).length;
              const groupAllChecked = groupCheckedCount === items.length;
              const groupSomeChecked = groupCheckedCount > 0 && !groupAllChecked;

              return (
                <div key={groupLabel} className="mb-3">
                  {groupLabel && (
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted group"
                      onClick={() => toggleGroup(items)}
                    >
                      <Checkbox
                        checked={groupAllChecked}
                        data-state={groupSomeChecked ? 'indeterminate' : groupAllChecked ? 'checked' : 'unchecked'}
                        className="h-3.5 w-3.5 data-[state=checked]:bg-[#2b3a9e] data-[state=checked]:border-[#2b3a9e] data-[state=indeterminate]:bg-[#2b3a9e] data-[state=indeterminate]:border-[#2b3a9e]"
                        onCheckedChange={() => toggleGroup(items)}
                        onClick={e => e.stopPropagation()}
                        data-testid={`checkbox-print-group-${groupLabel.toLowerCase().replace(/\s+/g, '-')}`}
                      />
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                        {groupLabel}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {groupCheckedCount}/{items.length}
                      </span>
                    </div>
                  )}
                  <div className="space-y-0.5 mt-0.5">
                    {items.map((section) => (
                      <div
                        key={section.id}
                        className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted"
                        style={{ paddingLeft: `${12 + (section.level || 0) * 16}px` }}
                        onClick={() => toggleSection(section.id)}
                      >
                        <Checkbox
                          id={`print-section-check-${section.id}`}
                          checked={selectedSections.has(section.id)}
                          onCheckedChange={() => toggleSection(section.id)}
                          onClick={e => e.stopPropagation()}
                          className="h-3.5 w-3.5 data-[state=checked]:bg-[#2b3a9e] data-[state=checked]:border-[#2b3a9e]"
                          data-testid={`checkbox-print-${section.id}`}
                        />
                        <Label
                          htmlFor={`print-section-check-${section.id}`}
                          className={`text-sm cursor-pointer ${section.level ? 'text-muted-foreground' : 'font-medium'}`}
                          onClick={e => e.stopPropagation()}
                        >
                          {section.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#ddd9d0] rounded-[10px]">
            Cancel
          </Button>
          {onPrintWithInsight && insightEnabled && (
            <Button
              onClick={handleInsightPrint}
              disabled={selectedSections.size === 0}
              className="flex items-center gap-2 bg-[#2b3a9e] hover:bg-[#3446bd] text-white rounded-[10px]"
              data-testid="button-print-with-insight"
              title="Generates the AI Insight Report (30–60s if not already generated), then prints it together with the selected sections"
            >
              <Sparkles className="w-4 h-4" />
              Generate Project Insight &amp; Print
            </Button>
          )}
          <Button
            onClick={handlePrint}
            disabled={selectedSections.size === 0}
            variant="outline"
            className="flex items-center gap-2 border-[#2b3a9e] text-[#2b3a9e] hover:bg-[#eef0fb] rounded-[10px]"
            data-testid="button-confirm-print"
          >
            <Printer className="w-4 h-4" />
            Print Report Data Only
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
