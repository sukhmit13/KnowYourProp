/**
 * Module-scope loaders for the local demographic JSON datasets
 * (vehicle ownership + seniors living alone, keyed by community area).
 * Used by the insight-report evidence builder; the interactive routes in
 * routes.ts keep their own closures.
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'server/data/demographics');

export interface VehicleOwnershipEntry {
  communityArea: string;
  communityNumber: number;
  totalHouseholds: number;
  noVehicle: number;
  pctNoVehicle: number;
  pctWithVehicle: number;
  avgVehiclesPerHousehold: number;
  autoDependencyLevel: string;
  comparedToCityAvg: string;
}

export interface SeniorsEntry {
  communityArea: string;
  communityNumber: number;
  totalPopulation: number;
  population65Plus: number;
  pct65Plus: number;
  seniorsLivingAlone: number;
  pctSeniorsLivingAlone: number;
  seniorDemandLevel: string;
  comparedToCityAvg: string;
  citywideRank: number;
  rankDescription: string;
}

let vehicleData: VehicleOwnershipEntry[] | null = null;
let seniorsData: SeniorsEntry[] | null = null;

function loadJson<T>(file: string): T[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
  } catch (e) {
    console.error(`[localDemographics] Failed to load ${file}:`, e);
    return [];
  }
}

export function getVehicleOwnership(communityArea: string | null | undefined): VehicleOwnershipEntry | null {
  if (!communityArea) return null;
  if (!vehicleData) vehicleData = loadJson<VehicleOwnershipEntry>('vehicle_ownership.json');
  const norm = communityArea.trim().toLowerCase();
  return vehicleData.find(d => d.communityArea.toLowerCase() === norm) || null;
}

export function getSeniorsData(communityArea: string | null | undefined): SeniorsEntry | null {
  if (!communityArea) return null;
  if (!seniorsData) seniorsData = loadJson<SeniorsEntry>('seniors_living_alone.json');
  const norm = communityArea.trim().toLowerCase();
  return seniorsData.find(d => d.communityArea.toLowerCase() === norm) || null;
}
