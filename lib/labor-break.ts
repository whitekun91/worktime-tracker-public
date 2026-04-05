/** Break deduction: 30m after 4h worked, 1h after 8h+ (simple display model). */

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

export function laborBreakBracketDescription(bracket: LaborBreakBracket): string {
  switch (bracket) {
    case "under4":
      return "Under 4h → no break deduction";
    case "from4to8":
      return "4h–8h → 30m deducted";
    case "from8":
      return "8h+ → 1h deducted";
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

export function laborBreakDeductionLabel(deductionMs: number): string {
  if (deductionMs === 0) return "none";
  if (deductionMs === MS_BREAK_30) return "30m";
  return "1h";
}
