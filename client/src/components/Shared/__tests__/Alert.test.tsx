/**
 * Alert (@structura/ui) behavior tests.
 *
 * The component lives in `packages/ui` but `packages/ui` has no test
 * runner of its own; we exercise the cross-package contract from the
 * client where vitest + jsdom are already configured. Coverage focuses
 * on the new affordances added in 1.40.x:
 *
 *   1. `onDismiss` prop renders an integrated × close button so call
 *      sites no longer hand-roll one (PageBuilderCompatCard had the
 *      original copy).
 *   2. Without `onDismiss` the close button is absent — the prop
 *      gates the UI, not the visibility of an unattached affordance.
 *   3. `dismissLabel` is forwarded to the button's `aria-label`, so
 *      WordPress translators can localize the close glyph instead of
 *      shipping an English-only "Dismiss".
 *   4. Direct-child icon and Title coexist without the icon visually
 *      colliding with the title — the regression that motivated the
 *      grid-layout refactor (icon was absolutely-positioned on top of
 *      the title in PageBuilderCompatCard). We assert both render and
 *      that the title's text content is intact, since DOM-level
 *      collision detection isn't available in jsdom.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Info } from "lucide-react";
import { Alert } from "@structura/ui";

describe("Alert", () => {
  it("does not render a close button when onDismiss is not provided", () => {
    render(
      <Alert variant="info">
        <Info data-testid="alert-icon" />
        <Alert.Title>Heads up</Alert.Title>
        <Alert.Description>Body copy</Alert.Description>
      </Alert>,
    );

    // `role="alert"` is set on the root; the dismiss button is the
    // only `<button>` we'd ever render — so its absence is the
    // signal we want to assert.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an integrated close button when onDismiss is provided and fires the handler on click", () => {
    const handleDismiss = vi.fn();
    render(
      <Alert variant="info" onDismiss={handleDismiss}>
        <Info />
        <Alert.Title>Heads up</Alert.Title>
        <Alert.Description>Body copy</Alert.Description>
      </Alert>,
    );

    const closeButton = screen.getByRole("button", { name: "Dismiss" });
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it("uses dismissLabel as the close button's accessible name", () => {
    render(
      <Alert
        variant="warning"
        onDismiss={() => {}}
        dismissLabel="Cerrar aviso"
      >
        <Alert.Title>Atención</Alert.Title>
      </Alert>,
    );

    expect(
      screen.getByRole("button", { name: "Cerrar aviso" }),
    ).toBeInTheDocument();
  });

  it("renders icon and title side-by-side without losing title text", () => {
    // Pre-refactor the alert variant absolutely-positioned the svg
    // and only padded direct-child <div>s — so when the title
    // (`<h5>`) sat next to the icon in PageBuilderCompatCard, the
    // svg overlapped the first letters of the headline. With the
    // grid layout the icon flows into column 1 and the title into
    // column 2; both must stay in the DOM and the title's text
    // content must not be eaten by the layout.
    render(
      <Alert variant="info">
        <Info data-testid="alert-icon" />
        <Alert.Title>Divi detected on this site.</Alert.Title>
        <Alert.Description>Body</Alert.Description>
      </Alert>,
    );

    expect(screen.getByTestId("alert-icon")).toBeInTheDocument();
    expect(
      screen.getByText("Divi detected on this site."),
    ).toBeInTheDocument();
  });
});
