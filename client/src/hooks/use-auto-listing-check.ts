import { useEffect, useRef } from "react";

/** Start one non-forced lookup only after the saved snapshot was read successfully. */
export function useAutoListingCheck(input: {
  runId: number | null | undefined;
  enabled: boolean;
  fetched: boolean;
  hasSnapshot: boolean;
  loadError: boolean;
  pending: boolean;
  lookupError: boolean;
  generate: (options: { force?: boolean }) => void;
}) {
  const attempted = useRef(new Set<number>());
  const { runId, enabled, fetched, hasSnapshot, loadError, pending, lookupError, generate } = input;
  useEffect(() => {
    if (!runId || !enabled || !fetched || loadError || hasSnapshot) return;
    if (pending || lookupError) {
      attempted.current.add(runId);
      return;
    }
    if (attempted.current.has(runId)) return;
    attempted.current.add(runId);
    generate({ force: false });
  }, [runId, enabled, fetched, hasSnapshot, loadError, pending, lookupError, generate]);
}