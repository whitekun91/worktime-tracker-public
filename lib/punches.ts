export type PunchType = "in" | "out";

export type Punch = {
  id: string;
  type: PunchType;
  at: string;
};

export function isPunch(value: unknown): value is Punch {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.at === "string" &&
    (v.type === "in" || v.type === "out")
  );
}
