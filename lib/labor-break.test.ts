import { describe, expect, it } from "vitest";
import {
  MS_4H,
  MS_8H,
  MS_BREAK_30,
  MS_HOUR,
  getLaborBreakBracket,
  laborBreakDeductionMs,
  netWorkingMsAfterLaborBreak,
} from "./labor-break";

describe("laborBreakDeductionMs", () => {
  it("returns 0 below 4h", () => {
    expect(laborBreakDeductionMs(MS_4H - 1)).toBe(0);
    expect(laborBreakDeductionMs(0)).toBe(0);
  });

  it("returns 30m from exactly 4h", () => {
    expect(laborBreakDeductionMs(MS_4H)).toBe(MS_BREAK_30);
  });

  it("returns 30m up to just under 8h", () => {
    expect(laborBreakDeductionMs(MS_8H - 1000)).toBe(MS_BREAK_30);
  });

  it("returns 1h from exactly 8h", () => {
    expect(laborBreakDeductionMs(MS_8H)).toBe(MS_HOUR);
  });

  it("returns 1h above 8h", () => {
    expect(laborBreakDeductionMs(MS_8H + 60 * 60 * 1000)).toBe(MS_HOUR);
  });
});

describe("netWorkingMsAfterLaborBreak", () => {
  it("4h + 30m elapsed → 4h net", () => {
    const elapsed = MS_4H + MS_BREAK_30;
    expect(netWorkingMsAfterLaborBreak(elapsed)).toBe(MS_4H);
  });

  it("8h elapsed → 7h net", () => {
    expect(netWorkingMsAfterLaborBreak(MS_8H)).toBe(MS_8H - MS_HOUR);
  });
});

describe("getLaborBreakBracket", () => {
  it("boundary brackets", () => {
    expect(getLaborBreakBracket(MS_4H - 1)).toBe("under4");
    expect(getLaborBreakBracket(MS_4H)).toBe("from4to8");
    expect(getLaborBreakBracket(MS_8H - 1)).toBe("from4to8");
    expect(getLaborBreakBracket(MS_8H)).toBe("from8");
  });
});
