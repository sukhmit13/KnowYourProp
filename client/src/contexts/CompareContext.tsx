import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface CompareItem {
  runId: number;
  address: string;
  lastProjectType?: string | null;
  label?: string | null;
  addedAt: Date;
}

export interface CompareHistoryEntry {
  id: number;
  runIds: number[];
  addresses: string[];
  projectTypes?: (string | null)[];
  createdAt: string;
}

interface CompareContextType {
  compareItems: CompareItem[];
  addToCompare: (item: Omit<CompareItem, 'addedAt'>) => boolean;
  removeFromCompare: (runId: number) => void;
  clearCompare: () => void;
  isInCompare: (runId: number) => boolean;
  canAddMore: boolean;
  updateItemProjectType: (runId: number, projectType: string | null) => void;
  saveToHistory: () => Promise<void>;
  compareHistory: CompareHistoryEntry[];
  loadCompareHistory: () => Promise<void>;
  deleteHistoryEntry: (id: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadFromHistory: (entry: CompareHistoryEntry) => void;
  syncWithExistingRuns: () => Promise<void>;
}

const MAX_COMPARE_ITEMS = 3;
const STORAGE_KEY = 'chicago-screener-compare';

const CompareContext = createContext<CompareContextType | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [compareItems, setCompareItems] = useState<CompareItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((item: any) => ({
          ...item,
          addedAt: new Date(item.addedAt)
        }));
      }
    } catch (e) {
      console.error('Failed to load compare items from localStorage:', e);
    }
    return [];
  });

  const [compareHistory, setCompareHistory] = useState<CompareHistoryEntry[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compareItems));
    } catch (e) {
      console.error('Failed to save compare items to localStorage:', e);
    }
  }, [compareItems]);

  // Sync basket with existing runs on mount
  const syncWithExistingRuns = useCallback(async () => {
    if (compareItems.length === 0) return;
    
    try {
      const runIds = compareItems.map(item => item.runId);
      const response = await apiRequest('POST', '/api/runs/validate', { runIds });
      const { existingIds } = await response.json() as { existingIds: number[] };
      
      // Remove items whose runs no longer exist
      const validItems = compareItems.filter(item => existingIds.includes(item.runId));
      if (validItems.length !== compareItems.length) {
        setCompareItems(validItems);
      }
    } catch (e) {
      console.error('Failed to validate compare items:', e);
    }
  }, [compareItems]);

  // Sync on initial mount
  useEffect(() => {
    syncWithExistingRuns();
    loadCompareHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCompareHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/compare-history');
      if (response.ok) {
        const history = await response.json();
        setCompareHistory(history);
      }
    } catch (e) {
      console.error('Failed to load compare history:', e);
    }
  }, []);

  const saveToHistory = useCallback(async () => {
    if (compareItems.length < 2) return;
    
    try {
      const runIds = compareItems.map(item => item.runId);
      const addresses = compareItems.map(item => item.address);
      const projectTypes = compareItems.map(item => item.lastProjectType || null);
      await apiRequest('POST', '/api/compare-history', { runIds, addresses, projectTypes });
      await loadCompareHistory();
    } catch (e) {
      console.error('Failed to save compare history:', e);
    }
  }, [compareItems, loadCompareHistory]);

  const deleteHistoryEntry = useCallback(async (id: number) => {
    try {
      await apiRequest('DELETE', `/api/compare-history/${id}`);
      setCompareHistory(prev => prev.filter(entry => entry.id !== id));
    } catch (e) {
      console.error('Failed to delete history entry:', e);
    }
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      await apiRequest('DELETE', '/api/compare-history');
      setCompareHistory([]);
    } catch (e) {
      console.error('Failed to clear compare history:', e);
    }
  }, []);

  const loadFromHistory = useCallback((entry: CompareHistoryEntry) => {
    // Validate that runs still exist before loading
    const items: CompareItem[] = entry.runIds.map((runId, index) => ({
      runId,
      address: entry.addresses[index] || '',
      lastProjectType: entry.projectTypes?.[index] || null,
      addedAt: new Date()
    }));
    setCompareItems(items);
    // Trigger validation
    setTimeout(syncWithExistingRuns, 100);
  }, [syncWithExistingRuns]);

  const addToCompare = (item: Omit<CompareItem, 'addedAt'>): boolean => {
    if (compareItems.length >= MAX_COMPARE_ITEMS) {
      return false;
    }
    if (compareItems.some(i => i.runId === item.runId)) {
      return false;
    }
    setCompareItems(prev => [...prev, { ...item, addedAt: new Date() }]);
    return true;
  };

  const removeFromCompare = (runId: number) => {
    setCompareItems(prev => prev.filter(item => item.runId !== runId));
  };

  const clearCompare = () => {
    setCompareItems([]);
  };

  const isInCompare = (runId: number): boolean => {
    return compareItems.some(item => item.runId === runId);
  };

  const updateItemProjectType = useCallback((runId: number, projectType: string | null) => {
    setCompareItems(prev => prev.map(item => 
      item.runId === runId ? { ...item, lastProjectType: projectType } : item
    ));
  }, []);

  const canAddMore = compareItems.length < MAX_COMPARE_ITEMS;

  return (
    <CompareContext.Provider value={{
      compareItems,
      addToCompare,
      removeFromCompare,
      clearCompare,
      isInCompare,
      canAddMore,
      updateItemProjectType,
      saveToHistory,
      compareHistory,
      loadCompareHistory,
      deleteHistoryEntry,
      clearHistory,
      loadFromHistory,
      syncWithExistingRuns
    }}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
}
