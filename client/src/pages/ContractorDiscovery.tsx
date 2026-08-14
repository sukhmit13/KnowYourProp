import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Hammer, 
  MapPin, 
  DollarSign, 
  Calendar, 
  BarChart3, 
  ChevronRight,
  Target,
  Clock,
  Building2,
  ArrowLeft,
  Menu
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Sidebar } from '@/components/Sidebar';

const SPECIALTY_DISPLAY_NAMES: Record<string, string> = {
  'new-construction': 'New Construction',
  'gut-rehab': 'Gut Rehab',
  'kitchen': 'Kitchen Remodeling',
  'bathroom': 'Bathroom Renovation',
  'roofing': 'Roofing',
  'hvac': 'HVAC/Mechanical',
  'electrical': 'Electrical',
  'plumbing': 'Plumbing',
  'deck-porch': 'Deck/Porch',
  'windows-doors': 'Windows/Doors',
  'siding-exterior': 'Siding/Exterior',
  'flooring': 'Flooring',
  'addition': 'Additions',
  'basement': 'Basement',
  'general': 'General Renovation'
};

interface Contractor {
  id: string;
  name: string;
  totalPermits: number;
  yearsActive: number;
  firstPermitDate: string;
  lastPermitDate: string;
  isActive: boolean;
  primarySpecialty: string;
  specializationScore: number;
  specialtyBreakdown: Record<string, number>;
  secondarySpecialties: string[];
  topNeighborhoods: { name: string; communityArea: number; count: number }[];
  totalReportedValue: number;
  avgProjectValue: number;
  permitsByYear: Record<string, number>;
  specialtyPermits?: number;
  recentActivity: number;
  recentProjects: {
    address: string;
    date: string;
    specialty: string;
    description: string;
    reportedValue: number;
  }[];
}

interface ContractorsResponse {
  contractors: Contractor[];
  total: number;
  specialtyCounts: Record<string, number>;
  neighborhoods: string[];
  lastUpdated: string | null;
  message?: string;
}

function ContractorCard({ contractor, rank, selectedSpecialty }: { contractor: Contractor; rank: number; selectedSpecialty?: string }) {
  const [expanded, setExpanded] = useState(false);
  
  const lastPermitDate = new Date(contractor.lastPermitDate);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  
  let activityStatus: 'active' | 'recent' | 'inactive' = 'inactive';
  if (lastPermitDate >= thirtyDaysAgo) activityStatus = 'active';
  else if (lastPermitDate >= ninetyDaysAgo) activityStatus = 'recent';
  
  const activityBadge = {
    active: { label: 'Active', className: '' },
    recent: { label: 'Recent', className: '' },
    inactive: { label: 'Inactive', className: '' }
  }[activityStatus];
  
  return (
    <Card className="hover-elevate" data-testid={`contractor-card-${contractor.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 bg-secondary flex items-center justify-center text-foreground font-display font-bold text-sm border border-border">
              #{rank}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base truncate">{contractor.name}</h3>
                <Badge variant="outline" className={activityBadge.className}>
                  {activityBadge.label}
                </Badge>
              </div>
              
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BarChart3 className="w-4 h-4 flex-shrink-0" />
                  {selectedSpecialty && selectedSpecialty !== 'all' && contractor.specialtyPermits != null ? (
                    <span>
                      <span className="text-foreground font-medium">{contractor.specialtyPermits.toLocaleString()} {(SPECIALTY_DISPLAY_NAMES[selectedSpecialty] || selectedSpecialty).toLowerCase()} permits</span>
                      <span className="text-muted-foreground/70"> · {contractor.totalPermits.toLocaleString()} total</span>
                    </span>
                  ) : (
                    <span>{contractor.totalPermits.toLocaleString()} permits</span>
                  )}
                  <span className="text-muted-foreground/50">|</span>
                  <span>{Math.round(contractor.yearsActive)} years active</span>
                </div>
                
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Target className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Specializes in: <span className="text-foreground font-medium">
                      {SPECIALTY_DISPLAY_NAMES[contractor.primarySpecialty] || contractor.primarySpecialty}
                    </span>
                    <span className="text-muted-foreground/70"> ({contractor.specializationScore}% of work)</span>
                  </span>
                </div>
                
                {contractor.topNeighborhoods.length > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Most active in: {contractor.topNeighborhoods.slice(0, 3).map(n => n.name).join(', ')}
                    </span>
                  </div>
                )}
                
                {contractor.avgProjectValue > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="w-4 h-4 flex-shrink-0" />
                    <span>Avg project value: ${contractor.avgProjectValue.toLocaleString()}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Last permit: {formatDistanceToNow(new Date(contractor.lastPermitDate), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setExpanded(!expanded)}
            data-testid={`button-expand-${contractor.id}`}
          >
            View Projects
            <ChevronRight className={`w-4 h-4 ml-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </Button>
        </div>
        
        {expanded && contractor.recentProjects.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Recent Projects</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {contractor.recentProjects.slice(0, 10).map((project, idx) => (
                <div key={idx} className="text-sm p-2 bg-muted rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{project.address}</span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(project.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                    {project.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {SPECIALTY_DISPLAY_NAMES[project.specialty] || project.specialty}
                    </Badge>
                    {project.reportedValue > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ${project.reportedValue.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ContractorDiscovery() {
  const [specialty, setSpecialty] = useState<string>('all');
  const [neighborhood, setNeighborhood] = useState<string>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>('totalPermits');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const { data, isLoading, error } = useQuery<ContractorsResponse>({
    queryKey: ['/api/contractors', specialty, neighborhood, activeOnly, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (specialty !== 'all') params.set('specialty', specialty);
      if (neighborhood !== 'all') params.set('neighborhood', neighborhood);
      if (activeOnly) params.set('activeOnly', 'true');
      params.set('sortBy', sortBy);
      params.set('limit', '50');
      
      const url = `/api/contractors?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch contractors');
      return res.json();
    }
  });
  
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 w-64 h-full">
            <Sidebar />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col relative overflow-auto">
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border">
          <button onClick={() => setSidebarOpen(true)} data-testid="button-mobile-menu">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-display text-sm font-bold tracking-tight">Contractors</span>
          <div className="w-6" />
        </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="link-back-home">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Home
            </Button>
          </Link>
          
          <div className="flex items-center gap-3 mb-2">
            <Hammer className="w-8 h-8 text-foreground" />
            <h1 className="text-2xl font-serif">Chicago Contractor Discovery</h1>
          </div>
          <p className="text-muted-foreground font-body">
            Explore top contractors by specialty and neighborhood. Rankings based on building permit data.
          </p>
          
          {data?.lastUpdated && (
            <p className="text-xs text-muted-foreground mt-2">
              Data last updated: {new Date(data.lastUpdated).toLocaleDateString()}
            </p>
          )}
        </div>
        
        <Card className="mb-6 border border-border">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Specialty</Label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger data-testid="select-specialty">
                    <SelectValue placeholder="All Specialties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Specialties</SelectItem>
                    {Object.entries(SPECIALTY_DISPLAY_NAMES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                        {data?.specialtyCounts?.[key] && (
                          <span className="ml-2 text-muted-foreground">
                            ({data.specialtyCounts[key].toLocaleString()})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Neighborhood</Label>
                <Select value={neighborhood} onValueChange={setNeighborhood}>
                  <SelectTrigger data-testid="select-neighborhood">
                    <SelectValue placeholder="All Neighborhoods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Neighborhoods</SelectItem>
                    {data?.neighborhoods?.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Sort By</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger data-testid="select-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="totalPermits">Most Permits</SelectItem>
                    <SelectItem value="recentActivity">Recent Activity</SelectItem>
                    <SelectItem value="avgProjectValue">Highest Avg Value</SelectItem>
                    <SelectItem value="yearsActive">Years in Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-end">
                <div className="flex items-center gap-2">
                  <Switch 
                    id="active-only" 
                    checked={activeOnly} 
                    onCheckedChange={setActiveOnly}
                    data-testid="switch-active-only"
                  />
                  <Label htmlFor="active-only" className="text-sm cursor-pointer">
                    Active Only
                  </Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-64" />
                      <Skeleton className="h-4 w-56" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Unable to load contractor data</p>
            </CardContent>
          </Card>
        ) : data?.contractors.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Hammer className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="font-medium mb-2">No contractors found</p>
              <p className="text-sm text-muted-foreground">
                {data?.message || 'Try adjusting your filters or run the build script to generate contractor data.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">
                Top Contractors
                <span className="text-muted-foreground font-normal ml-2">
                  ({data?.total.toLocaleString()} total)
                </span>
              </h2>
            </div>
            
            <div className="space-y-3">
              {data?.contractors.map((contractor, index) => (
                <ContractorCard 
                  key={contractor.id} 
                  contractor={contractor} 
                  rank={index + 1}
                  selectedSpecialty={specialty}
                />
              ))}
            </div>
            
            {data && data.contractors.length < data.total && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Showing {data.contractors.length} of {data.total.toLocaleString()} contractors
              </div>
            )}
          </>
        )}
      </div>
      </main>
    </div>
  );
}
