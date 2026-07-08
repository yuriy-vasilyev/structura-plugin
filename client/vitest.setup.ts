/**
 * Vitest global setup for client tests.
 *
 * Wires up `@testing-library/jest-dom` matchers (`toBeInTheDocument`,
 * `toHaveTextContent`, etc.) so tests can use them without per-file imports.
 * The package is provided at the workspace root.
 *
 * Also runs `@testing-library/react`'s `cleanup()` after each test —
 * Jest's testing-library preset does this automatically, but Vitest does
 * not, so without it DOM nodes from one test leak into the next and
 * `getByText` / `getByRole` queries hit duplicates.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
