/**
 * Prisma returns `Decimal` for money columns. The UI wants plain numbers, and
 * this is the single place the conversion happens.
 */
export function toNumber(value: { toNumber(): number } | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

export function toNumberOrNull(
  value: { toNumber(): number } | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : value.toNumber();
}
