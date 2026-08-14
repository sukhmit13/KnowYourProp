import { useState, useMemo, useCallback } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Custom filter that does word-based matching instead of fuzzy matching
function customFilter(value: string, search: string): number {
  const searchLower = search.toLowerCase().trim();
  const valueLower = value.toLowerCase();
  
  // Exact match gets highest score
  if (valueLower === searchLower) return 1;
  
  // Contains the full search term
  if (valueLower.includes(searchLower)) return 0.8;
  
  // Check if all search words are found in the value
  const searchWords = searchLower.split(/\s+/).filter(w => w.length > 0);
  const allWordsFound = searchWords.every(word => valueLower.includes(word));
  if (allWordsFound) return 0.6;
  
  // Partial word match - at least one word matches
  const someWordsFound = searchWords.some(word => valueLower.includes(word));
  if (someWordsFound) return 0.3;
  
  return 0;
}

interface BusinessUse {
  name: string;
  category: string;
  zoningCategory: string;
}

interface ProjectTypeComboboxProps {
  uses: BusinessUse[];
  categories: string[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ProjectTypeCombobox({
  uses,
  categories,
  value,
  onValueChange,
  placeholder = "Select or search for a use type...",
  disabled = false,
}: ProjectTypeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // When searching, sort by match score. Otherwise, group by category.
  const { sortedUses, usesByCategory, isSearching } = useMemo(() => {
    const query = searchQuery.trim();
    const isSearching = query.length > 0;
    
    if (isSearching) {
      // Score and sort all uses by match quality
      const scored = uses.map(use => ({
        use,
        score: customFilter(use.name, query)
      })).filter(item => item.score > 0);
      
      scored.sort((a, b) => b.score - a.score);
      
      return {
        sortedUses: scored.map(item => item.use),
        usesByCategory: {} as Record<string, BusinessUse[]>,
        isSearching: true
      };
    } else {
      // Group by category when not searching
      const result: Record<string, BusinessUse[]> = {};
      for (const category of categories) {
        const categoryUses = uses.filter((u) => u.category === category);
        if (categoryUses.length > 0) {
          result[category] = categoryUses;
        }
      }
      return {
        sortedUses: [] as BusinessUse[],
        usesByCategory: result,
        isSearching: false
      };
    }
  }, [uses, categories, searchQuery]);

  const selectedUse = uses.find((u) => u.name === value);

  const handleSelect = (currentValue: string) => {
    onValueChange(currentValue === value ? null : currentValue);
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full max-w-md justify-between text-left font-normal bg-white border-[#ddd9d0] rounded-lg hover:bg-white focus-visible:border-[#2b3a9e] focus-visible:ring-2 focus-visible:ring-[#2b3a9e]/20"
          data-testid="select-project-type"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selectedUse ? selectedUse.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Type to search use types..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
            data-testid="input-project-type-search"
          />
          <CommandList>
            <CommandEmpty>No use type found.</CommandEmpty>
            {isSearching ? (
              // Flat list sorted by relevance when searching
              <CommandGroup heading="Search Results">
                {sortedUses.map((use) => (
                  <CommandItem
                    key={use.name}
                    value={use.name}
                    onSelect={handleSelect}
                    data-testid={`option-${use.name.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === use.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{use.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {use.category} · Zoning: {use.zoningCategory}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              // Grouped by category when not searching
              Object.entries(usesByCategory).map(([category, categoryUses]) => (
                <CommandGroup key={category} heading={category}>
                  {categoryUses.map((use) => (
                    <CommandItem
                      key={use.name}
                      value={use.name}
                      onSelect={handleSelect}
                      data-testid={`option-${use.name.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === use.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{use.name}</span>
                        {use.zoningCategory !== use.name && (
                          <span className="text-xs text-muted-foreground">
                            Zoning: {use.zoningCategory}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
