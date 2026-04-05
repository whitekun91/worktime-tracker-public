/** 휴게 차감: 누적 4시간 이상 8시간 미만 30분, 8시간 이상 1시간 (표시용 단순 모델). */

export const MS_HOUR = 60 * 60 * 1000;
export const MS_4H = 4 * MS_HOUR;
export const MS_8H = 8 * MS_HOUR;
export const MS_BREAK_30 = 30 * 60 * 1000;

export type LaborBreakBracket = "under4" | "from4to8" | "from8";

export function getLaborBreakBracket(elapsedMs: number): LaborBreakBracket {
  if (elapsedMs < MS_4H) return "under4";
  if (elapsedMs < MS_8H) return "from4to8";
  return "from8";
}

export function laborBreakBracketDescriptionKo(bracket: LaborBreakBracket): string {
  switch (bracket) {
    case "under4":
      return "4시간 미만 → 휴게 차감 없음";
    case "from4to8":
      return "4시간 이상 8시간 미만 → 30분 차감";
    case "from8":
      return "8시간 이상 → 1시간 차감";
  }
}

export function laborBreakDeductionMs(elapsedMs: number): number {
  if (elapsedMs < MS_4H) return 0;
  if (elapsedMs < MS_8H) return MS_BREAK_30;
  return MS_HOUR;
}

export function netWorkingMsAfterLaborBreak(elapsedMs: number): number {
  return Math.max(0, elapsedMs - laborBreakDeductionMs(elapsedMs));
}

export function laborBreakDeductionLabelKo(deductionMs: number): string {
  if (deductionMs === 0) return "없음";
  if (deductionMs === MS_BREAK_30) return "30분";
  return "1시간";
}
