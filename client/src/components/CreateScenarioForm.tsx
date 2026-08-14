import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { insertScenarioSchema, PROJECT_TYPES, SPONSOR_TYPES, type CreateScenarioRequest } from "@shared/schema";
import { useCreateScenario } from "@/hooks/use-runs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Calculator, Building2, Wallet, DollarSign } from "lucide-react";
import { Separator } from "@/components/ui/separator";

// Extend schema to handle number inputs as strings from form
const formSchema = insertScenarioSchema.extend({
  projectSize: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Must be a valid amount"),
});

interface CreateScenarioFormProps {
  runId: number;
}

export function CreateScenarioForm({ runId }: CreateScenarioFormProps) {
  const [open, setOpen] = useState(false);
  const createScenario = useCreateScenario();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      projectType: PROJECT_TYPES[0],
      sponsorType: SPONSOR_TYPES[0],
      projectSize: "",
      runId: runId,
      workforceTraining: false,
      reentryHiring: false,
      onsiteManufacturing: false,
      adaptiveReuse: false,
      corridorImprovements: false,
      nonprofitAnchor: false,
      jobCreationFocus: false,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createScenario.mutate(values as CreateScenarioRequest, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full h-12 border-dashed border-2 bg-transparent text-muted-foreground hover:bg-muted hover:text-primary hover:border-primary/30 transition-all font-medium">
          <Plus className="w-5 h-5 mr-2" />
          Add New Scenario
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-jbmono text-base font-bold uppercase tracking-[0.06em] text-foreground flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            New Financial Scenario
          </DialogTitle>
          <DialogDescription>
            Configure project parameters to test NMTC eligibility and feasibility.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scenario Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Base Case, High Density Option" {...field} className="font-medium" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="projectType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PROJECT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sponsorType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sponsor Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select sponsor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SPONSOR_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="projectSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Project Cost (USD)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                        <Input 
                          type="number" 
                          placeholder="5000000" 
                          {...field} 
                          className="pl-10 font-mono" 
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs">
                      Estimates under $5M may struggle to attract NMTC allocation.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            
            <div className="space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Community Benefits & Features
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { name: "workforceTraining", label: "Workforce Training" },
                  { name: "reentryHiring", label: "Re-entry Hiring" },
                  { name: "onsiteManufacturing", label: "Onsite Manufacturing" },
                  { name: "adaptiveReuse", label: "Adaptive Reuse" },
                  { name: "corridorImprovements", label: "Corridor Improvements" },
                  { name: "nonprofitAnchor", label: "Nonprofit Anchor" },
                  { name: "jobCreationFocus", label: "Job Creation Focus" },
                ].map((item) => (
                  <FormField
                    key={item.name}
                    control={form.control}
                    name={item.name as any}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 hover:bg-muted transition-colors">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-normal cursor-pointer">
                            {item.label}
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button 
                type="submit" 
                disabled={createScenario.isPending}
                className="bg-[#2b3a9e] hover:bg-[#3446bd] text-white rounded-[10px] font-jbmono text-xs font-bold uppercase tracking-[0.12em]"
              >
                {createScenario.isPending ? "Creating..." : "Create Scenario"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
