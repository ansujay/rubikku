export type ClassValue = string | number | boolean | null | undefined | ClassValue[]

/** Join class names, skipping falsy values (including 0, so `count && 'x'` never leaks a "0"). */
export function cx(...values: ClassValue[]): string {
  const out: string[] = []
  for (const value of values) {
    if (!value || value === true) continue
    if (Array.isArray(value)) {
      const inner = cx(...value)
      if (inner) out.push(inner)
    } else {
      out.push(String(value))
    }
  }
  return out.join(' ')
}
