export interface CountyLookupState {
  label: string;
  detail: string;
  retry: "pin" | "tax" | null;
}

export function countyLookupState(input: {
  hasAddress: boolean;
  pin: string | null | undefined;
  pinLoading: boolean;
  pinError: boolean;
  taxLoading: boolean;
  taxError: boolean;
  hasTaxData: boolean;
}): CountyLookupState {
  if (input.hasTaxData) return { label: "Record loaded", detail: "County records loaded.", retry: null };
  if (input.pin) {
    if (input.taxLoading) return { label: "Loading tax records", detail: "PIN resolved. Loading county tax records…", retry: null };
    if (input.taxError) return { label: "Tax lookup failed", detail: "The county tax lookup failed. This does not mean there is no tax bill.", retry: "tax" };
    return { label: "Bill unavailable", detail: "No Treasurer bill was returned for this PIN. Retry the lookup or verify directly with the county.", retry: "tax" };
  }
  if (input.pinLoading) return { label: "Resolving PIN", detail: "Finding the parcel PIN before checking county tax records…", retry: null };
  if (input.pinError) return { label: "PIN lookup failed", detail: "The automatic PIN lookup failed, so tax records have not been checked. Retry the lookup or enter a PIN in Parcel & Building Details.", retry: "pin" };
  if (input.hasAddress) return { label: "PIN not resolved", detail: "The automatic lookup did not resolve a parcel PIN. Retry the lookup or enter a PIN in Parcel & Building Details.", retry: "pin" };
  return { label: "Awaiting address", detail: "An address or parcel PIN is needed to check county tax records.", retry: null };
}