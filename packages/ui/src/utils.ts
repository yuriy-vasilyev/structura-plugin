import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * A utility function to conditionally join class names and merge Tailwind CSS classes without style conflicts.
 * @param inputs - A list of class names, which can be strings, objects, or arrays.
 * @returns A single string of merged and de-duplicated class names.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const generateRandomId = (length: number = 8): string =>
  `${Math.random().toString(36).substring(length)}`;
