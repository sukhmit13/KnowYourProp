
import { z } from 'zod';
import { insertRunSchema, insertScenarioSchema, runs, scenarios, geocodeCache, LocationFacts } from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  rateLimit: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  runs: {
    list: {
      method: 'GET' as const,
      path: '/api/runs',
      responses: {
        200: z.array(z.custom<typeof runs.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/runs/:id',
      responses: {
        200: z.custom<typeof runs.$inferSelect & { scenarios: typeof scenarios.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/runs',
      input: insertRunSchema,
      responses: {
        201: z.custom<typeof runs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/runs/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  scenarios: {
    create: {
      method: 'POST' as const,
      path: '/api/scenarios',
      input: insertScenarioSchema,
      responses: {
        201: z.custom<typeof scenarios.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/scenarios/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  geocoding: {
    lookup: {
      method: 'POST' as const,
      path: '/api/geocoding/lookup',
      input: z.object({ address: z.string() }),
      responses: {
        200: z.custom<LocationFacts>(),
        400: errorSchemas.validation,
        429: errorSchemas.rateLimit,
      },
    },
    autocomplete: {
      method: 'GET' as const,
      path: '/api/geocoding/autocomplete',
      input: z.object({ q: z.string() }),
      responses: {
        200: z.array(z.object({
          address: z.string(),
        })),
        400: errorSchemas.validation,
      },
    },
  },
};

// ============================================
// HELPERS
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type RunInput = z.infer<typeof api.runs.create.input>;
export type ScenarioInput = z.infer<typeof api.scenarios.create.input>;
export type LookupInput = z.infer<typeof api.geocoding.lookup.input>;
