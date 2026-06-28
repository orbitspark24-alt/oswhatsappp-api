// Billing/usage cycles step monthly from a subscription's start date. These helpers keep
// that math in one place so invoices and usage records share identical period boundaries.

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  const result = new Date(d);
  result.setMonth(targetMonth);
  // Guard against day overflow (e.g. Jan 31 + 1 month) — clamp to last day of target month.
  if (result.getDate() < d.getDate()) {
    result.setDate(0);
  }
  return result;
}

export interface Period {
  start: Date;
  end: Date;
  index: number; // 0-based number of whole cycles since startDate
}

// The monthly period that contains `now`, anchored to `startDate`.
export function currentPeriod(startDate: Date, now: Date = new Date()): Period {
  let index = 0;
  let start = new Date(startDate);
  // Advance until the next boundary is in the future.
  // Bounded loop guards against pathological inputs.
  for (let i = 0; i < 1200; i++) {
    const end = addMonths(startDate, index + 1);
    if (now < end) {
      start = addMonths(startDate, index);
      return { start, end, index };
    }
    index++;
  }
  // Fallback: treat as first period.
  return { start: new Date(startDate), end: addMonths(startDate, 1), index: 0 };
}
