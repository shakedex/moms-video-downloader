import strings from "./he.json";

export type StringKey = keyof typeof strings;

export function t(key: StringKey): string {
  const v = strings[key];
  if (v === undefined) {
    throw new Error(`Missing string: ${key}`);
  }
  return v;
}
