/**
 * SignatureBuilder (visual-signatures handoff §3.5; spec §6): Name, Medium
 * as radios, four fields with help lines and phrase chips, and "Draft from
 * my site", which drafts Technique and Avoid in the chosen medium and never
 * sets the medium. Real hooks; only `apiFetch` (the network edge) and the
 * license hook are stubbed.
 */
import { createRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@structura/ui";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));
vi.mock("@/features/settings", () => ({ useLicense: () => ({ plan: "byok" }) }));

import { SignatureBuilder } from "../SignatureBuilder";
import { newCustomDraft, type BuilderField, type CustomSignatureDraft } from "../signatureModel";

const BLOB = [
  "STYLE: Loose ink illustration with visible paper grain.",
  "PALETTE: #2F6B4F dominant.",
  "LIGHTING: Flat, even light.",
  "TEXTURE & FINISH: Matte paper.",
  "AVOID: text, typography, busy clutter.",
].join("\n");

function Harness({
  initial,
  errors = new Set(),
  onBack = vi.fn(),
}: {
  initial: CustomSignatureDraft;
  errors?: ReadonlySet<"name" | BuilderField>;
  onBack?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const refs = {
    technique: createRef<HTMLTextAreaElement>(),
    motifs: createRef<HTMLTextAreaElement>(),
    composition: createRef<HTMLTextAreaElement>(),
    avoid: createRef<HTMLTextAreaElement>(),
  };
  return (
    <ToastProvider>
      <SignatureBuilder
        headingId="builder"
        headingRef={createRef()}
        nameRef={createRef()}
        fieldRefs={refs}
        draft={draft}
        onUpdate={(update) => setDraft((d) => update(d))}
        errors={errors}
        onFieldEdited={() => {}}
        onBack={onBack}
        draftProvider="gemini"
        draftSources={[{ title: "Northfield Garden", url: "https://northfield.test" }]}
      />
      <pre data-testid="draft">{JSON.stringify(draft)}</pre>
    </ToastProvider>
  );
}

const draftState = () =>
  JSON.parse(screen.getByTestId("draft").textContent!) as CustomSignatureDraft;
const field = (label: string) => screen.getByRole("textbox", { name: label });
const chip = (phrase: string, label: string) =>
  screen.getByRole("button", { name: `Add “${phrase}” to ${label}` });
const fieldGroup = (label: string) =>
  field(label).closest("div.flex.flex-col.gap-1\\.5") as HTMLElement;

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("SignatureBuilder", () => {
  it("shows the name, medium and four fields with their help lines", () => {
    render(<Harness initial={newCustomDraft("Northfield Garden")} />);
    expect(screen.getByRole("heading", { name: "Your own signature" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Northfield Garden");
    expect(screen.getByText("Shown on its card in your library.")).toBeInTheDocument();
    const medium = screen.getByRole("radiogroup", { name: "Medium" });
    expect(within(medium).getByRole("radio", { name: "Photography" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByText("Real photographs of one subject.")).toBeInTheDocument();
    for (const label of ["Technique", "Motifs", "Composition", "Avoid"]) {
      expect(field(label)).toHaveValue("");
    }
    expect(field("Motifs")).toHaveAccessibleDescription(
      "The recurring cast and objects that make your posts feel like one series."
    );
    expect(screen.getByRole("button", { name: /Draft from my site/ })).toBeInTheDocument();
  });

  it("switching the medium changes the chip set and its help line", () => {
    render(<Harness initial={newCustomDraft("Site")} />);
    expect(chip("Soft window light", "Technique")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Illustration" }));
    expect(draftState().medium).toBe("illustration");
    expect(chip("Black ink linework", "Technique")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add “Soft window light” to Technique" })
    ).toBeNull();
    expect(screen.getByText("Drawn images: line, shape and flat color.")).toBeInTheDocument();
  });

  it("a chip adds its phrase, shows pressed, and removes it again", () => {
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(chip("Soft window light", "Technique"));
    fireEvent.click(chip("Shallow depth of field", "Technique"));
    expect(field("Technique")).toHaveValue("Soft window light, shallow depth of field");
    expect(chip("Soft window light", "Technique")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(chip("Soft window light", "Technique"));
    expect(field("Technique")).toHaveValue("shallow depth of field");
    expect(chip("Soft window light", "Technique")).toHaveAttribute("aria-pressed", "false");
  });

  it("typing a chip's phrase by hand turns the chip on", () => {
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.change(field("Avoid"), { target: { value: "no text and lettering please" } });
    expect(chip("Text and lettering", "Avoid")).toHaveAttribute("aria-pressed", "true");
  });

  it("Draft from my site fills Technique and Avoid in the chosen medium, with Drafted marks", async () => {
    apiFetchMock.mockResolvedValue({
      prompt: BLOB,
      videoArtDirection: "FOOTAGE: x",
      palette: ["#000000"],
    });
    const initial = { ...newCustomDraft("Northfield Garden"), medium: "illustration" as const };
    initial.fields.motifs = "Plants and leaves";
    render(<Harness initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: /Draft from my site/ }));

    await waitFor(() =>
      expect(field("Technique")).toHaveValue(
        "Loose ink illustration with visible paper grain. Flat, even light. Matte paper."
      )
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/structura/v1/suggest",
        data: expect.objectContaining({
          mode: "visual",
          medium: "illustration",
          context: [{ title: "Northfield Garden", url: "https://northfield.test" }],
        }),
      })
    );
    const state = draftState();
    expect(state.fields.avoid).toBe("text, typography, busy clutter.");
    // The user's motifs survive; composition stays for them to fill.
    expect(state.fields.motifs).toBe("Plants and leaves");
    expect(state.fields.composition).toBe("");
    // Drafting never sets the medium or the name (spec §6).
    expect(state.medium).toBe("illustration");
    expect(state.name).toBe("Northfield Garden");
    expect(state.drafted).toEqual({ technique: true, avoid: true });
    expect(within(fieldGroup("Technique")).getByText("Drafted")).toBeInTheDocument();
    expect(within(fieldGroup("Motifs")).queryByText("Drafted")).toBeNull();
    expect(screen.getByRole("button", { name: /Draft again/ })).toBeInTheDocument();
    expect(screen.getByText("Drafted the technique and what to avoid from your site.").closest('[role="status"]')).not.toBeNull();
  });

  it("editing a drafted field removes its mark only", async () => {
    apiFetchMock.mockResolvedValue({ prompt: BLOB });
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(screen.getByRole("button", { name: /Draft from my site/ }));
    await waitFor(() => expect(draftState().drafted).toEqual({ technique: true, avoid: true }));

    fireEvent.change(field("Avoid"), { target: { value: "Text" } });

    expect(draftState().drafted).toEqual({ technique: true });
    expect(within(fieldGroup("Avoid")).queryByText("Drafted")).toBeNull();
    expect(within(fieldGroup("Technique")).getByText("Drafted")).toBeInTheDocument();
  });

  it("locks the fields, chips and medium while drafting", async () => {
    let resolve!: (value: unknown) => void;
    apiFetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Harness initial={newCustomDraft("Site")} />);

    fireEvent.click(screen.getByRole("button", { name: /Draft from my site/ }));

    await waitFor(() => expect(field("Technique")).toBeDisabled());
    expect(chip("Soft window light", "Technique")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Photography" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(
      screen.getByText("Drafting from your site.", { selector: "[role=status]" })
    ).toBeInTheDocument();
    await act(async () => resolve({ prompt: BLOB }));
    await waitFor(() => expect(field("Technique")).toBeEnabled());
  });

  it("an empty draft answer says so and leaves the fields alone", async () => {
    apiFetchMock.mockResolvedValue({ prompt: "" });
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(screen.getByRole("button", { name: /Draft from my site/ }));
    expect(
      await screen.findByText(
        "Couldn’t draft from your site right now. Try again, or fill the fields yourself."
      )
    ).toBeInTheDocument();
    expect(draftState().drafted).toEqual({});
  });

  it("a refused draft shows the suggest error and leaves the fields alone", async () => {
    apiFetchMock.mockRejectedValue({
      code: "cloud_suggestion_error",
      message: "x",
      data: { code: "ai_rate_limited", status: 502 },
    });
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(screen.getByRole("button", { name: /Draft from my site/ }));
    expect(await screen.findByText(/Too many AI requests from this workspace/)).toBeInTheDocument();
    expect(draftState().fields.technique).toBe("");
  });

  it("shows the Name and field errors a save found", () => {
    render(<Harness initial={newCustomDraft("")} errors={new Set(["name", "motifs"] as const)} />);
    expect(screen.getByText("Name this signature to save it.")).toBeInTheDocument();
    expect(screen.getAllByText("Fill this in to save the signature.")).toHaveLength(1);
  });

  it("All signatures goes back", () => {
    const onBack = vi.fn();
    render(<Harness initial={newCustomDraft("Site")} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /All signatures/ }));
    expect(onBack).toHaveBeenCalled();
  });
});
