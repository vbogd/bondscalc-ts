import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CALCULATOR_PREFERENCES,
  loadCalculatorPreferences,
  loadSearchQuery,
  saveCalculatorPreferences,
  saveSearchQuery,
} from "./persistence";

describe("persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores search and calculator preferences", () => {
    saveSearchQuery("ОФЗ 26233");
    saveCalculatorPreferences({
      commissionPercent: "0.1",
      taxPercent: "15",
    });

    expect(loadSearchQuery()).toBe("ОФЗ 26233");
    expect(loadCalculatorPreferences()).toEqual({
      commissionPercent: "0.1",
      taxPercent: "15",
    });
  });

  it("falls back to defaults for malformed calculator preferences", () => {
    window.localStorage.setItem(
      "bondscalc.calculator-preferences.v1",
      "not-json",
    );

    expect(loadCalculatorPreferences()).toEqual(
      DEFAULT_CALCULATOR_PREFERENCES,
    );
  });
});
