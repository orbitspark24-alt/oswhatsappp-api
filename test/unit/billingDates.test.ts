import { describe, it, expect } from "vitest";
import { addMonths, currentPeriod } from "../../src/lib/billingDates";

describe("billingDates", () => {
  it("adds months", () => {
    expect(addMonths(new Date("2026-01-15T00:00:00Z"), 1).getUTCMonth()).toBe(1); // Feb
    expect(addMonths(new Date("2026-01-15T00:00:00Z"), 12).getUTCFullYear()).toBe(2027);
  });

  it("clamps day overflow (Jan 31 + 1 month -> end of Feb)", () => {
    const result = addMonths(new Date("2026-01-31T00:00:00Z"), 1);
    expect(result.getMonth()).toBe(1); // February, not March
  });

  it("computes the current period containing now", () => {
    const start = new Date("2026-01-10T00:00:00Z");
    const now = new Date("2026-03-15T00:00:00Z");
    const p = currentPeriod(start, now);
    expect(now >= p.start && now < p.end).toBe(true);
    expect(p.index).toBe(2); // third cycle (0-based)
  });

  it("first period when now is within the first cycle", () => {
    const start = new Date("2026-01-10T00:00:00Z");
    const p = currentPeriod(start, new Date("2026-01-20T00:00:00Z"));
    expect(p.index).toBe(0);
  });
});
