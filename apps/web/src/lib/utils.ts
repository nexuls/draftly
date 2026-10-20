import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose class names, resolving conflicting Tailwind utilities in favour of the last one.
 *
 * @param inputs - Class values; falsy entries and nested arrays/objects are accepted
 * @returns The merged class string
 *
 * @example
 * ```ts
 * cn("px-2 py-1", isActive && "bg-accent", className);
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
