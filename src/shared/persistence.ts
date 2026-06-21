const SEARCH_QUERY_STORAGE_KEY = "bondscalc.search-query.v1";
const CALCULATOR_PREFERENCES_STORAGE_KEY =
  "bondscalc.calculator-preferences.v1";

export type CalculatorPreferences = {
  commissionPercent: string;
  taxPercent: string;
};

export const DEFAULT_CALCULATOR_PREFERENCES: CalculatorPreferences = {
  commissionPercent: "0.05",
  taxPercent: "13",
};

export function loadSearchQuery(): string {
  return readStorageValue(SEARCH_QUERY_STORAGE_KEY) ?? "";
}

export function saveSearchQuery(query: string): void {
  writeStorageValue(SEARCH_QUERY_STORAGE_KEY, query);
}

export function loadCalculatorPreferences(): CalculatorPreferences {
  const storedValue = readStorageValue(CALCULATOR_PREFERENCES_STORAGE_KEY);

  if (storedValue === null) {
    return { ...DEFAULT_CALCULATOR_PREFERENCES };
  }

  try {
    const preferences: unknown = JSON.parse(storedValue);

    if (
      !isRecord(preferences) ||
      typeof preferences.commissionPercent !== "string" ||
      typeof preferences.taxPercent !== "string"
    ) {
      return { ...DEFAULT_CALCULATOR_PREFERENCES };
    }

    return {
      commissionPercent: preferences.commissionPercent,
      taxPercent: preferences.taxPercent,
    };
  } catch {
    return { ...DEFAULT_CALCULATOR_PREFERENCES };
  }
}

export function saveCalculatorPreferences(
  preferences: CalculatorPreferences,
): void {
  writeStorageValue(
    CALCULATOR_PREFERENCES_STORAGE_KEY,
    JSON.stringify(preferences),
  );
}

function readStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Persistence is optional when storage is unavailable.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
