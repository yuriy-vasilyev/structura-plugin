/**
 * SignatureBuilder (visual-signatures handoff §3.5; spec §6, §14.4): Name,
 * Medium as radios, four fields with help lines and phrase chips, "Draft
 * from my site", which drafts Technique and Avoid in the chosen medium and
 * never sets the medium, and "Draft from images", which drafts the medium
 * too from one to three sample images. Real hooks on a real query client;
 * only `apiFetch` (the network edge), the license hook and the browser's
 * image decoder (the DOM edge; jsdom has none) are stubbed.
 */
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));
vi.mock("@/features/settings", () => ({ useLicense: () => ({ plan: "byok" }) }));

import type { VisualMedium } from "../../api/useVisualPresets";
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
  onFieldEdited = () => {},
  onUseColors = () => {},
  media,
}: {
  initial: CustomSignatureDraft;
  errors?: ReadonlySet<"name" | BuilderField>;
  onBack?: () => void;
  onFieldEdited?: (field: "name" | BuilderField) => void;
  onUseColors?: (palette: string[]) => void;
  media?: readonly VisualMedium[];
}) {
  const [draft, setDraft] = useState(initial);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
  );
  const refs = {
    technique: createRef<HTMLTextAreaElement>(),
    motifs: createRef<HTMLTextAreaElement>(),
    composition: createRef<HTMLTextAreaElement>(),
    avoid: createRef<HTMLTextAreaElement>(),
  };
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SignatureBuilder
          headingId="builder"
          headingRef={createRef()}
          nameRef={createRef()}
          fieldRefs={refs}
          draft={draft}
          onUpdate={(update) => setDraft((d) => update(d))}
          errors={errors}
          onFieldEdited={onFieldEdited}
          onBack={onBack}
          draftProvider="gemini"
          draftSources={[{ title: "Northfield Garden", url: "https://northfield.test" }]}
          media={media}
          onUseColors={onUseColors}
        />
        <pre data-testid="draft">{JSON.stringify(draft)}</pre>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const draftState = () =>
  JSON.parse(screen.getByTestId("draft").textContent!) as CustomSignatureDraft;
const field = (label: string) => screen.getByRole("textbox", { name: label });
const chip = (phrase: string, label: string) =>
  screen.getByRole("button", { name: `Add “${phrase}” to ${label}` });
const fieldGroup = (label: string) =>
  field(label).closest("div.flex.flex-col.gap-1\\.5") as HTMLElement;

const DRAFT_FROM_IMAGES = "/structura/v1/visual-signature/draft-from-images";
const imagesToggle = () => screen.getByRole("button", { name: "Draft from images" });
const panel = () => screen.getByRole("group", { name: "Draft from images" });
const draftButton = () =>
  within(panel()).getByRole("button", { name: /^(Draft|.*Reading your images)$/ });
const removeImage = (n: number) =>
  within(panel()).getByRole("button", { name: `Remove image ${n}` });
const offeredColors = () => within(panel()).queryByRole("list", { name: "Colors in your images" });
const useColorsButton = () => within(panel()).getByRole("button", { name: "Use these colors" });

/** Picks a file through the panel's first slot that takes one. */
const pick = (file: File) => {
  const input = panel().querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [file] } });
};

/** Picks a file and waits until the browser has scaled it into slot `n`. */
const pickScaled = async (file: File, n: number) => {
  pick(file);
  await waitFor(() => expect(removeImage(n)).toBeEnabled());
};

/** The draft-from-images request bodies sent so far. */
const imageDraftBodies = () =>
  apiFetchMock.mock.calls
    .map(([request]) => request as { path: string; method?: string; data: Record<string, unknown> })
    .filter((request) => request.path === DRAFT_FROM_IMAGES);

/** The browser's decoder and canvas, stubbed at the DOM edge (jsdom has neither). */
function stubImageDecoding(opts: { decodes: boolean; width?: number; height?: number }) {
  const sizes: Array<{ width: number; height: number }> = [];
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => {
      if (!opts.decodes) throw new Error("decode failed");
      return { width: opts.width ?? 4032, height: opts.height ?? 3024, close: vi.fn() };
    })
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    sizes.push({ width: this.width, height: this.height });
    return {
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(255),
      }),
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) =>
    callback(new Blob(["shrunk"], { type: type ?? "image/png" }))
  );
  return sizes;
}

const DRAFTED = {
  success: true,
  medium: "illustration",
  technique: "Flat vector shapes, thick outlines.",
  avoid: "Gradients, photo textures.",
};

beforeEach(() => {
  apiFetchMock.mockReset();
  document.documentElement.lang = "";
  let previews = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${(previews += 1)}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    expect(
      screen.getByText(
        "Five fields fix the look of every image. Draft them from your site or from images, then change anything."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Draft from my site/ })).toBeInTheDocument();
    expect(imagesToggle()).toBeInTheDocument();
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

describe("Draft from images (spec §14.4)", () => {
  it("opens and closes the panel under the header; Draft waits for an image", () => {
    render(<Harness initial={newCustomDraft("Site")} />);
    const toggle = imagesToggle();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Draft from images" })).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", panel().id);
    expect(
      within(panel()).getByText(
        "Upload up to three images in the style you want. We read the style from them and draft the medium, the technique and what to avoid. The images aren’t stored."
      )
    ).toBeInTheDocument();
    expect(
      within(panel()).getAllByRole("button", { name: /^Add image \([123] of 3\)$/ })
    ).toHaveLength(3);
    expect(draftButton()).toHaveAccessibleName("Draft");
    expect(draftButton()).toBeDisabled();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Draft from images" })).toBeNull();
  });

  it("scales a picked image in the browser and posts it with the offered media and the admin's language", async () => {
    document.documentElement.lang = "de-DE";
    const sizes = stubImageDecoding({ decodes: true, width: 4032, height: 3024 });
    apiFetchMock.mockResolvedValue(DRAFTED);
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(imagesToggle());

    await pickScaled(new File(["photo"], "sample-1.jpg", { type: "image/jpeg" }), 1);

    expect(sizes[0]).toEqual({ width: 1536, height: 1152 });
    expect(within(panel()).getByText("sample-1.jpg")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();

    fireEvent.click(draftButton());

    await waitFor(() => expect(imageDraftBodies()).toHaveLength(1));
    const [request] = imageDraftBodies();
    expect(request!.method).toBe("POST");
    expect(request!.data).toEqual({
      images: [expect.stringMatching(/^data:image\/jpeg;base64,/)],
      media: ["photography", "illustration", "3d_render"],
      locale: "de",
    });
  });

  it("locks the fields, the medium and the site draft while it reads the images", async () => {
    stubImageDecoding({ decodes: true });
    let resolve!: (value: unknown) => void;
    apiFetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "a.jpg", { type: "image/jpeg" }), 1);

    fireEvent.click(draftButton());

    await waitFor(() => expect(draftButton()).toHaveTextContent("Reading your images"));
    expect(draftButton()).toBeDisabled();
    expect(field("Technique")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Photography" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByRole("button", { name: /Draft from my site/ })).toBeDisabled();
    expect(removeImage(1)).toBeDisabled();
    expect(
      screen.getByText("Reading your images", { selector: "[role=status]" })
    ).toBeInTheDocument();

    await act(async () => resolve(DRAFTED));
    await waitFor(() => expect(field("Technique")).toBeEnabled());
  });

  it("sets the medium, fills Technique and Avoid with Drafted marks, and leaves Motifs and Composition alone", async () => {
    stubImageDecoding({ decodes: true });
    apiFetchMock.mockResolvedValue(DRAFTED);
    const onFieldEdited = vi.fn();
    const initial = newCustomDraft("Northfield Garden");
    initial.fields.motifs = "Plants and leaves";
    initial.fields.composition = "One subject, centered";
    render(<Harness initial={initial} onFieldEdited={onFieldEdited} />);
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "a.jpg", { type: "image/jpeg" }), 1);

    fireEvent.click(draftButton());

    await waitFor(() => expect(field("Technique")).toHaveValue(DRAFTED.technique));
    const state = draftState();
    expect(state.medium).toBe("illustration");
    expect(screen.getByRole("radio", { name: "Illustration" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(state.fields.avoid).toBe(DRAFTED.avoid);
    expect(state.fields.motifs).toBe("Plants and leaves");
    expect(state.fields.composition).toBe("One subject, centered");
    expect(state.name).toBe("Northfield Garden");
    // Technique and Avoid carry the mark; the medium switches without one.
    expect(state.drafted).toEqual({ technique: true, avoid: true });
    expect(within(fieldGroup("Avoid")).getByText("Drafted")).toBeInTheDocument();
    expect(within(fieldGroup("Motifs")).queryByText("Drafted")).toBeNull();
    expect(onFieldEdited.mock.calls).toEqual([["technique"], ["avoid"]]);
    expect(
      screen
        .getByText("Drafted the medium, the technique and what to avoid from your images.")
        .closest('[role="status"]')
    ).not.toBeNull();
    // The images stay for another try; the site draft keeps its own label.
    expect(removeImage(1)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Draft from my site/ })).toBeInTheDocument();
  });

  it("sends only Illustration and 3D render while a recurring character is chosen", async () => {
    stubImageDecoding({ decodes: true });
    apiFetchMock.mockResolvedValue({ ...DRAFTED, medium: "3d_render" });
    render(
      <Harness
        initial={{ ...newCustomDraft("Site"), medium: "illustration" }}
        media={["illustration", "3d_render"]}
      />
    );
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "a.png", { type: "image/png" }), 1);

    fireEvent.click(draftButton());

    await waitFor(() => expect(draftState().medium).toBe("3d_render"));
    expect(imageDraftBodies()[0]!.data.media).toEqual(["illustration", "3d_render"]);
    // No supported admin language: the cloud drafts in English.
    expect(imageDraftBodies()[0]!.data).not.toHaveProperty("locale");
  });

  it("keeps the medium when the answer names one the builder does not offer", async () => {
    stubImageDecoding({ decodes: true });
    apiFetchMock.mockResolvedValue({ ...DRAFTED, medium: "photography" });
    render(
      <Harness
        initial={{ ...newCustomDraft("Site"), medium: "illustration" }}
        media={["illustration", "3d_render"]}
      />
    );
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "a.jpg", { type: "image/jpeg" }), 1);

    fireEvent.click(draftButton());

    await waitFor(() => expect(field("Technique")).toHaveValue(DRAFTED.technique));
    expect(draftState().medium).toBe("illustration");
  });

  it("an answer with nothing to fill toasts the failure and changes nothing", async () => {
    stubImageDecoding({ decodes: true });
    apiFetchMock.mockResolvedValue({
      success: true,
      medium: "3d_render",
      technique: " ",
      avoid: "",
    });
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "a.jpg", { type: "image/jpeg" }), 1);

    fireEvent.click(draftButton());

    expect(
      await screen.findByText(
        "Couldn’t draft from your images right now. Try again, or fill the fields yourself."
      )
    ).toBeInTheDocument();
    expect(draftState().medium).toBe("photography");
    expect(draftState().drafted).toEqual({});
  });

  it("a failed draft toasts, leaves the fields alone and keeps the images for another try", async () => {
    stubImageDecoding({ decodes: true });
    apiFetchMock.mockRejectedValueOnce({
      code: "cloud_error",
      message: "Refused.",
      data: { status: 500, code: "common.internal" },
    });
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "a.jpg", { type: "image/jpeg" }), 1);
    await pickScaled(new File(["x"], "b.jpg", { type: "image/jpeg" }), 2);

    fireEvent.click(draftButton());

    expect(
      await screen.findByText(
        "Couldn’t draft from your images right now. Try again, or fill the fields yourself."
      )
    ).toBeInTheDocument();
    expect(draftState().fields.technique).toBe("");
    expect(draftState().drafted).toEqual({});
    expect(removeImage(2)).toBeInTheDocument();
    await waitFor(() => expect(draftButton()).toBeEnabled());

    apiFetchMock.mockResolvedValue(DRAFTED);
    fireEvent.click(draftButton());

    await waitFor(() => expect(imageDraftBodies()).toHaveLength(2));
    expect(imageDraftBodies()[1]!.data.images).toEqual(imageDraftBodies()[0]!.data.images);
    expect(imageDraftBodies()[1]!.data.images).toHaveLength(2);
  });

  it("refuses another file type or HEIC in the slot with the character intake's messages, sending nothing", () => {
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(imagesToggle());

    pick(new File(["x"], "anim.gif", { type: "image/gif" }));

    expect(within(panel()).getByRole("alert")).toHaveTextContent(
      "This file type can’t be used. Use a JPG, PNG or WebP image."
    );
    expect(within(panel()).getByRole("button", { name: "Choose another" })).toBeInTheDocument();
    expect(draftButton()).toBeDisabled();

    pick(new File(["x"], "IMG_0001.HEIC", { type: "" }));

    expect(within(panel()).getByRole("alert")).toHaveTextContent(
      "HEIC is an iPhone photo format we can’t use."
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("a file the browser cannot decode gets the wrong-type state", async () => {
    stubImageDecoding({ decodes: false });
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(imagesToggle());

    pick(new File(["not an image"], "photo.jpg", { type: "image/jpeg" }));

    expect(await within(panel()).findByRole("alert")).toHaveTextContent(
      "This file type can’t be used."
    );
    expect(draftButton()).toBeDisabled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it("the cloud's refusal of the bytes toasts the character intake's message", async () => {
    stubImageDecoding({ decodes: true });
    apiFetchMock.mockRejectedValue({
      code: "cloud_error",
      message: "Refused.",
      data: { status: 400, code: "visualCharacter.imageHeic" },
    });
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "renamed.jpg", { type: "image/jpeg" }), 1);

    fireEvent.click(draftButton());

    expect(
      await screen.findByText(
        "HEIC is an iPhone photo format we can’t use. Export it as JPG first, then add it here."
      )
    ).toBeInTheDocument();
  });

  it("removing an image moves focus to its slot and frees its preview", async () => {
    stubImageDecoding({ decodes: true });
    render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "a.jpg", { type: "image/jpeg" }), 1);
    await pickScaled(new File(["x"], "b.jpg", { type: "image/jpeg" }), 2);

    fireEvent.click(removeImage(1));

    await waitFor(() => expect(removeImage(1)).toHaveFocus());
    expect(within(panel()).getByText("b.jpg")).toBeInTheDocument();
    expect(within(panel()).queryByText("a.jpg")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it("keeps the images while the panel closes and drops them when the builder closes", async () => {
    stubImageDecoding({ decodes: true });
    const { unmount } = render(<Harness initial={newCustomDraft("Site")} />);
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "a.jpg", { type: "image/jpeg" }), 1);

    fireEvent.click(imagesToggle());
    fireEvent.click(imagesToggle());

    expect(within(panel()).getByText("a.jpg")).toBeInTheDocument();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });
});

describe("Colors in your images (spec §14.4)", () => {
  /** Opens the panel, picks one image and runs a draft that answers `answer`. */
  const draftWith = async (answer: Record<string, unknown>) => {
    apiFetchMock.mockResolvedValue(answer);
    fireEvent.click(draftButton());
    await waitFor(() => expect(field("Technique")).toHaveValue(answer.technique as string));
  };
  const openWithImage = async () => {
    fireEvent.click(imagesToggle());
    await pickScaled(new File(["x"], "a.jpg", { type: "image/jpeg" }), 1);
  };

  it("offers no colors before a draft, nor after one whose answer has none or no palette", async () => {
    stubImageDecoding({ decodes: true });
    render(<Harness initial={newCustomDraft("Site")} />);
    await openWithImage();
    expect(offeredColors()).toBeNull();

    // An answer without `palette` reads as no colors.
    await draftWith(DRAFTED);
    expect(offeredColors()).toBeNull();

    await draftWith({ ...DRAFTED, technique: "Matte clay.", palette: [] });
    expect(offeredColors()).toBeNull();
    expect(within(panel()).queryByRole("button", { name: "Use these colors" })).toBeNull();
  });

  it("shows the colors read from the samples as swatches with their hex, accent first, without touching the palette", async () => {
    stubImageDecoding({ decodes: true });
    const onUseColors = vi.fn();
    render(<Harness initial={newCustomDraft("Site")} onUseColors={onUseColors} />);
    await openWithImage();

    await draftWith({ ...DRAFTED, palette: ["#2f6b4f", "not a colour", "#C8553D"] });

    const list = offeredColors()!;
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["#2F6B4FAccent", "#C8553D"]);
    expect(within(panel()).getByText("Colors in your images")).toBeInTheDocument();
    expect(useColorsButton()).toBeEnabled();
    // The draft fills the fields only; the palette changes on "Use these colors".
    expect(onUseColors).not.toHaveBeenCalled();
    expect(
      screen
        .getByText("Drafted the medium, the technique and what to avoid from your images.")
        .closest('[role="status"]')
    ).not.toBeNull();
  });

  it("Use these colors hands exactly those colors to the form and says so in the status line", async () => {
    stubImageDecoding({ decodes: true });
    const onUseColors = vi.fn();
    render(<Harness initial={newCustomDraft("Site")} onUseColors={onUseColors} />);
    await openWithImage();
    await draftWith({ ...DRAFTED, palette: ["#2F6B4F", "#C8553D", "#A3C585"] });

    fireEvent.click(useColorsButton());

    expect(onUseColors.mock.calls).toEqual([[["#2F6B4F", "#C8553D", "#A3C585"]]]);
    expect(
      screen.getByText("Applied the colors from your images.").closest('[role="status"]')
    ).not.toBeNull();
    // The builder's own draft is untouched by it.
    expect(draftState().fields.technique).toBe(DRAFTED.technique);
  });

  it("a new draft replaces the offered colors, and Use these colors waits while it runs", async () => {
    stubImageDecoding({ decodes: true });
    const onUseColors = vi.fn();
    render(<Harness initial={newCustomDraft("Site")} onUseColors={onUseColors} />);
    await openWithImage();
    await draftWith({ ...DRAFTED, palette: ["#2F6B4F", "#C8553D"] });

    let resolve!: (value: unknown) => void;
    apiFetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    fireEvent.click(draftButton());
    await waitFor(() => expect(useColorsButton()).toBeDisabled());

    await act(async () => resolve({ ...DRAFTED, technique: "Matte clay.", palette: ["#111827"] }));

    await waitFor(() =>
      expect(
        within(offeredColors()!)
          .getAllByRole("listitem")
          .map((i) => i.textContent)
      ).toEqual(["#111827Accent"])
    );
    fireEvent.click(useColorsButton());
    expect(onUseColors).toHaveBeenLastCalledWith(["#111827"]);
  });
});
