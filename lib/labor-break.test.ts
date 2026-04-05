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
  it("4시간 미만은 0", () => {
    expect(laborBreakDeductionMs(MS_4H - 1)).toBe(0);
    expect(laborBreakDeductionMs(0)).toBe(0);
  });

  it("정확히 4시간부터 30분", () => {
    expect(laborBreakDeductionMs(MS_4H)).toBe(MS_BREAK_30);
  });

  it("7시간 59분 59초까지 30분", () => {
    expect(laborBreakDeductionMs(MS_8H - 1000)).toBe(MS_BREAK_30);
  });

  it("정확히 8시간부터 1시간", () => {
    expect(laborBreakDeductionMs(MS_8H)).toBe(MS_HOUR);
  });

  it("8시간 초과도 1시간", () => {
    expect(laborBreakDeductionMs(MS_8H + 60 * 60 * 1000)).toBe(MS_HOUR);
  });
});

describe("netWorkingMsAfterLaborBreak", () => {
  it("4시간 + 30분 경과 → 실근무 4시간", () => {
    const elapsed = MS_4H + MS_BREAK_30;
    expect(netWorkingMsAfterLaborBreak(elapsed)).toBe(MS_4H);
  });

  it("8시간 경과 → 실근무 7시간", () => {
    expect(netWorkingMsAfterLaborBreak(MS_8H)).toBe(MS_8H - MS_HOUR);
  });
});

describe("getLaborBreakBracket", () => {
  it("경계 구간", () => {
    expect(getLaborBreakBracket(MS_4H - 1)).toBe("under4");
    expect(getLaborBreakBracket(MS_4H)).toBe("from4to8");
    expect(getLaborBreakBracket(MS_8H - 1)).toBe("from4to8");
    expect(getLaborBreakBracket(MS_8H)).toBe("from8");
  });
});
