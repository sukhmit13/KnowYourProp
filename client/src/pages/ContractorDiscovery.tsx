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
import { Input } from '@/components/ui/input';
import { trackEvent } from '@/lib/analytics';
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
  Menu,
  Search
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
  'tile': 'Tile',
  'framing': 'Framing',
  'excavation': 'Excavation/Foundation',
  'addition': 'Additions',
  'basement': 'Basement',
  'general': 'General Renovation'
};

const PROJECT_SCOPE_DISPLAY_NAMES: Record<string, string> = {
  'bathroom-strict': 'Bathroom-only / narrow scope',
  bathroom: 'Bathroom mentioned',
  'kitchen-strict': 'Kitchen-only / narrow scope',
  kitchen: 'Kitchen mentioned',
  'kitchen-bath': 'Kitchen and bath project',
  'simple-residential': 'Simple residential alteration',
  addition: 'Addition',
  'basement-excavation': 'Basement digging / underpinning',
  'gut-rehab': 'Gut rehab / whole interior',
  'ground-up': 'Ground-up construction',
  'commercial-industrial': 'Commercial / industrial',
  other: 'Other permit work',
};

const CONTRACTOR_ROLE_DISPLAY_NAMES: Record<string, string> = {
  general: 'General contractor',
  electrical: 'Electrical contractor',
  plumbing: 'Plumbing contractor',
  'hvac/mechanical': 'HVAC / mechanical contractor',
  roofing: 'Roofing contractor',
  masonry: 'Masonry contractor',
  'carpentry/framing': 'Carpentry / framing contractor',
  tile: 'Tile contractor',
  concrete: 'Concrete contractor',
  elevator: 'Elevator contractor',
  alarm: 'Alarm contractor',
  sign: 'Sign contractor',
  tent: 'Tent contractor',
  'wrecking/demolition': 'Wrecking / demolition contractor',
  contractor: 'Other contractor',
};

const PROPERTY_CONTEXT_DISPLAY_NAMES: Record<string, string> = {
  'one-unit-residential': '1-unit residential (single-family / condo)',
  'residential-1-4': 'Residential, 1–4 units',
  'single-family': 'Single-family home',
  condo: 'Condo',
  'multi-family': 'Multi-family residence',
  'residential-unspecified': 'Residential — type unspecified',
  'commercial-industrial': 'Commercial / industrial',
  unknown: 'Property type not stated',
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
  searchMatchCount?: number;
  searchMatches?: string[];
  scopePermits?: number;
  rolePermits?: number;
  evidencePermits?: number;
  roleCounts?: Record<string, number>;
  projectScopeCounts?: Record<string, number>;
  strictProjectScopeCounts?: Record<string, number>;
  scopeValueStats?: { count: number; total: number; median: number } | null;
  listedCityTypes?: { type: string; count: number }[];
  recentActivity: number;
  recentProjects: {
    address: string;
    date: string;
    specialty: string;
    projectScope?: string;
    contractorRoles?: string[];
    rawContactTypes?: string[];
    propertyContext?: string;
    strictScope?: boolean;
    description: string;
    reportedValue: number;
  }[];
}

interface ContractorsResponse {
  contractors: Contractor[];
  total: number;
  specialtyCounts: Record<string, number>;
  availableRoles?: string[];
  neighborhoods: string[];
  lastUpdated: string | null;
  message?: string;
}

function ContractorCard({
  contractor,
  rank,
  selectedSpecialty,
  selectedProjectScope,
  selectedRole,
  selectedPropertyContext,
  search,
}: {
  contractor: Contractor;
  rank: number;
  selectedSpecialty?: string;
  selectedProjectScope?: string;
  selectedRole?: string;
  selectedPropertyContext?: string;
  search?: string;
}) {
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
  const activeEvidenceLabels = [
    selectedProjectScope && selectedProjectScope !== 'all'
      ? PROJECT_SCOPE_DISPLAY_NAMES[selectedProjectScope]
      : null,
    selectedRole && selectedRole !== 'all'
      ? CONTRACTOR_ROLE_DISPLAY_NAMES[selectedRole] || selectedRole
      : null,
    selectedPropertyContext && selectedPropertyContext !== 'all'
      ? PROPERTY_CONTEXT_DISPLAY_NAMES[selectedPropertyContext] || selectedPropertyContext
      : null,
  ].filter(Boolean);
  
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
                  {activeEvidenceLabels.length > 0 && contractor.evidencePermits != null ? (
                    <span>
                      <span className="text-foreground font-medium">
                        {contractor.evidencePermits.toLocaleString()} matching permits
                      </span>
                      <span className="text-muted-foreground/70"> · {activeEvidenceLabels.join(' · ')} · {contractor.totalPermits.toLocaleString()} total</span>
                    </span>
                  ) : selectedSpecialty && selectedSpecialty !== 'all' && contractor.specialtyPermits != null ? (
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

                {search && contractor.searchMatches && contractor.searchMatches.length > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Search className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Match: <span className="text-foreground font-medium">{contractor.searchMatches.join(' · ')}</span>
                    </span>
                  </div>
                )}

                {activeEvidenceLabels.length > 0 &&
                  selectedSpecialty &&
                  selectedSpecialty !== 'all' &&
                  contractor.specialtyPermits != null && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Target className="w-4 h-4 flex-shrink-0" />
                      <span>
                        Separate overall profile filter: <span className="text-foreground font-medium">
                          {contractor.specialtyPermits.toLocaleString()} {(SPECIALTY_DISPLAY_NAMES[selectedSpecialty] || selectedSpecialty).toLowerCase()} permits
                        </span> across its full history
                      </span>
                    </div>
                  )}

                {selectedProjectScope && selectedProjectScope !== 'all' && contractor.scopeValueStats && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Median reported whole-permit value: <span className="text-foreground font-medium">
                        ${contractor.scopeValueStats.median.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground/70"> · {contractor.scopeValueStats.count} permits with values</span>
                    </span>
                  </div>
                )}

                {contractor.roleCounts && Object.keys(contractor.roleCounts).length > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Hammer className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Listed roles: {Object.entries(contractor.roleCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([role, count]) => `${CONTRACTOR_ROLE_DISPLAY_NAMES[role] || role} (${count})`)
                        .join(' · ')}
                    </span>
                  </div>
                )}

                {contractor.listedCityTypes && contractor.listedCityTypes.length > 0 && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <Building2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      City permit labels: {contractor.listedCityTypes
                        .map(item => `${item.type} (${item.count})`)
                        .join(' · ')}
                    </span>
                  </div>
                )}
                
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
            onClick={() => {
              if (!expanded) {
                trackEvent('contractor_projects_viewed', {
                  result_context: 'contractor_discovery',
                  has_recent_projects: contractor.recentProjects.length > 0,
                });
              }
              setExpanded(!expanded);
            }}
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
                    {project.projectScope && (
                      <Badge variant="outline" className="text-xs">
                        {PROJECT_SCOPE_DISPLAY_NAMES[project.projectScope] || project.projectScope}
                        {project.strictScope ? ' · narrow scope' : ''}
                      </Badge>
                    )}
                    {project.propertyContext && project.propertyContext !== 'unknown' && (
                      <Badge variant="outline" className="text-xs">
                        {PROPERTY_CONTEXT_DISPLAY_NAMES[project.propertyContext] || project.propertyContext}
                      </Badge>
                    )}
                    {project.contractorRoles?.map(role => (
                      <Badge key={role} variant="outline" className="text-xs">
                        {CONTRACTOR_ROLE_DISPLAY_NAMES[role] || role}
                      </Badge>
                    ))}
                    {project.reportedValue > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ${project.reportedValue.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {project.rawContactTypes && project.rawContactTypes.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      City-listed type: {project.rawContactTypes.join(' · ')}
                    </p>
                  )}
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
  const [projectScope, setProjectScope] = useState<string>('all');
  const [contractorRole, setContractorRole] = useState<string>('all');
  const [propertyContext, setPropertyContext] = useState<string>('all');
  const [neighborhood, setNeighborhood] = useState<string>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>('totalPermits');
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const { data, isLoading, error } = useQuery<ContractorsResponse>({
    queryKey: ['/api/contractors', specialty, projectScope, contractorRole, propertyContext, neighborhood, activeOnly, sortBy, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (specialty !== 'all') params.set('specialty', specialty);
      if (projectScope !== 'all') params.set('projectScope', projectScope);
      if (contractorRole !== 'all') params.set('contractorRole', contractorRole);
      if (propertyContext !== 'all') params.set('propertyContext', propertyContext);
      if (neighborhood !== 'all') params.set('neighborhood', neighborhood);
      if (activeOnly) params.set('activeOnly', 'true');
      if (search.trim()) params.set('search', search.trim());
      params.set('sortBy', sortBy);
      params.set('limit', '50');
      
      const url = `/api/contractors?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch contractors');
      return res.json();
    }
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setSortBy(currentSort => {
      if (value.trim() && currentSort === 'totalPermits') return 'searchMatch';
      if (!value.trim() && currentSort === 'searchMatch') return 'totalPermits';
      return currentSort;
    });
  };
  
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
            <div className="mb-4">
              <Label htmlFor="contractor-search" className="text-xs text-muted-foreground mb-1 block">
                Search by contractor or project work
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="contractor-search"
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="Try bathroom, tile, kitchen, or a contractor name"
                  className="pl-9"
                  data-testid="input-contractor-search"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Results are ranked by matching permit evidence. A listed role does not prove the firm is a fit for your job, and reported value covers the whole permit—not the contractor's fee.
                Project scope, permit role, and property context must occur on the same permit; overall specialty is a separate contractor-history filter.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Overall Permit Specialty</Label>
                <Select value={specialty} onValueChange={(value) => {
                  trackEvent('contractor_filter_changed', { filter: 'specialty', value });
                  setSpecialty(value);
                }}>
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
                <Label className="text-xs text-muted-foreground mb-1 block">Project Scope</Label>
                <Select value={projectScope} onValueChange={(value) => {
                  trackEvent('contractor_filter_changed', { filter: 'project_scope', value });
                  setProjectScope(value);
                }}>
                  <SelectTrigger data-testid="select-project-scope">
                    <SelectValue placeholder="All Project Scopes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Project Scopes</SelectItem>
                    {Object.entries(PROJECT_SCOPE_DISPLAY_NAMES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Listed Permit Role</Label>
                <Select value={contractorRole} onValueChange={(value) => {
                  trackEvent('contractor_filter_changed', { filter: 'contractor_role', value });
                  setContractorRole(value);
                }}>
                  <SelectTrigger data-testid="select-contractor-role">
                    <SelectValue placeholder="Any Listed Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Listed Role</SelectItem>
                    {(data?.availableRoles || Object.keys(CONTRACTOR_ROLE_DISPLAY_NAMES)).map(role => (
                      <SelectItem key={role} value={role}>
                        {CONTRACTOR_ROLE_DISPLAY_NAMES[role] || role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Property Context</Label>
                <Select value={propertyContext} onValueChange={(value) => {
                  trackEvent('contractor_filter_changed', { filter: 'property_context', value });
                  setPropertyContext(value);
                }}>
                  <SelectTrigger data-testid="select-property-context">
                    <SelectValue placeholder="Any Property Context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Property Context</SelectItem>
                    <SelectItem value="one-unit-residential">1-unit residential (single-family / condo)</SelectItem>
                    <SelectItem value="residential-1-4">Residential, 1–4 units</SelectItem>
                    {Object.entries(PROPERTY_CONTEXT_DISPLAY_NAMES)
                      .filter(([key]) => !['one-unit-residential', 'residential-1-4'].includes(key))
                      .map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Neighborhood</Label>
                <Select value={neighborhood} onValueChange={(value) => {
                  trackEvent('contractor_filter_changed', { filter: 'neighborhood', value });
                  setNeighborhood(value);
                }}>
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
                <Select value={sortBy} onValueChange={(value) => {
                  trackEvent('contractor_sort_changed', { value });
                  setSortBy(value);
                }}>
                  <SelectTrigger data-testid="select-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="searchMatch">Best Match</SelectItem>
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
                    onCheckedChange={(checked) => {
                      trackEvent('contractor_filter_changed', { filter: 'active_only', value: checked });
                      setActiveOnly(checked);
                    }}
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
                 {search.trim() ? `Matches for “${search.trim()}”` : 'Top Contractors'}
                <span className="text-muted-foreground font-normal ml-2">
                  ({data?.total.toLocaleString()} total)
                </span>
              </h2>
            </div>
            
            <div className="space-y-3">
              {data?.contractors.map((contractor, index) => (
                <ContractorCard 
                  key={`${contractor.id}-${contractor.name}-${index}`}
                  contractor={contractor} 
                  rank={index + 1}
                  selectedSpecialty={specialty}
                   selectedProjectScope={projectScope}
                   selectedRole={contractorRole}
                   selectedPropertyContext={propertyContext}
                   search={search.trim()}
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
