import { z } from "zod";
import type { IssCellValue, IssRow } from "./types";

const issCellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const issTableSchema = z.object({
  columns: z.array(z.string()),
  data: z.array(z.array(issCellValueSchema)),
});

export function normalizeIssTable(table: unknown): IssRow[] {
  const parsed = issTableSchema.parse(table);

  return parsed.data.map((row) =>
    Object.fromEntries(
      parsed.columns.map((column, index) => [column, row[index] ?? null]),
    ),
  );
}

export function getCell(row: IssRow, key: string): IssCellValue {
  const directValue = row[key];

  if (directValue !== undefined) {
    return directValue;
  }

  const normalizedKey = key.toLowerCase();
  const matchedKey = Object.keys(row).find(
    (rowKey) => rowKey.toLowerCase() === normalizedKey,
  );

  return matchedKey ? row[matchedKey] : null;
}

export function getString(row: IssRow, key: string): string | null {
  const value = getCell(row, key);

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

export function getNumber(row: IssRow, key: string): number | null {
  const value = getCell(row, key);

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = Number(value.replace(",", "."));
    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

export function getBoolean(row: IssRow, key: string): boolean {
  const value = getCell(row, key);

  return value === true || value === 1 || value === "1";
}

export function getLocalDate(row: IssRow, key: string): string | null {
  const value = getString(row, key);

  if (!value || value === "0000-00-00") {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

