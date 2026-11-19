/**
 * Visuals page: the recurring character (handoff
 * handoffs/recurring-character/README.md §2 to §8, spec
 * specs/visual-signatures.md §13.12). The selector and its locked,
 * unavailable and kept states, the filtered grid, the intake and its checks,
 * the sheet approval, the card, Remove, the Save refusals in order with their
 * focus moves, and what Save and the preview send.
 *
 * The page, the character editor, the picker, the sections and the
 * character model run for real on a real query cache. `apiFetch` (the network
 * edge) answers the plugin's character routes, the preview and the thin
 * pass; the browser's image decoder is stubbed at the DOM edge. The preset
 * list and the save mutations are stubbed at the settings barrel, as the
 * page's other suites do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";
import { MemoryRouter } from "react-router";

type Request = { path: string; method?: string; data?: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  character: vi.fn(),
  license: { plan: "byok", isPaidLicense: true } as Record<string, unknown>,
  presets: undefined as Record<string, unknown> | undefined,
  update: vi.fn(),
  fork: vi.fn(),
}));

vi.mock("@wordpress/api-fetch", () => ({ default: mocks.apiFetch }));

vi.mock("@/features/settings", () => ({
  useLicense: () => mocks.license,
  useDefaultProviders: () => ({
    defaultImageProvider: "gemini",
    defaultTextProvider: "gemini",
    isCloud: false,
  }),
  usePublicSiteProfile: () => ({
    data: {
      name: "Lena Hofer Styling",
      publicUrl: "https://lenahofer.test",
      homeUrl: "https://lenahofer.test",
    },
  }),
  useVisualPresetMutations: () => ({
    create: vi.fn(),
    update: mocks.update,
    fork: mocks.fork,
    remove: vi.fn(),
    bind: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isForking: false,
    isRemoving: false,
    isBinding: false,
  }),
  useVisualPresetsQuery: () => ({ data: mocks.presets, isLoading: false }),
  useVisualQuery: () => ({ data: undefined }),
}));

vi.mock("@/features/channels/hooks/useVideoStylingEligibility", () => ({
  useVideoStylingEligibility: () => "unknown",
}));

import { VisualsPage } from "../VisualsPage";

const HOUSE = { kind: "curated", id: "editorial-reportage", version: 1 };
const INK = { kind: "curated", id: "ink-and-fill", version: 1 };
const PALETTE = ["#7A3E5A", "#E0A93B"];
const SUGGESTION = {
  pick: "paper-cut",
  runnerUp: "ink-and-fill",
  reason: "Warm and hand-made.",
  palette: PALETTE,
};
const IMG = (n: number) => ({ url: `https://img.test/upload-${n}.jpg` });
const SHEET = { url: "https://img.test/sheet.png", signature: INK };

/** A saved person drawn in Ink and fill. */
const LENA = {
  kind: "person",
  name: "Lena",
  description: "A woman in her thirties with a dark bob and red glasses.",
  reference: "sheet",
  outfit: "same",
  images: [IMG(1), IMG(2), IMG(3)],
  sheet: { ...SHEET, approvedAt: "2026-11-18T10:00:00.000Z" },
};

const draftOf = (images: number, sheet?: Record<string, unknown>) => ({
  kind: "person",
  images: Array.from({ length: images }, (_, i) => IMG(i + 1)),
  ...(sheet ? { sheet } : {}),
});

function preset(over: Record<string, unknown> = {}) {
  return {
    presetId: "p1",
    workspaceId: "w1",
    label: "Lena look",
    globalArtDirection: "",
    aspectRatio: "16:9",
    format: "webp",
    optimizeOnUpload: true,
    medium: "photography",
    aiLabel: false,
    boundActivationCount: 1,
    createdBy: "u",
    createdAt: "",
    updatedAt: "",
    signature: HOUSE,
    palette: PALETTE,
    ...over,
  };
}

function bindPreset(over: Record<string, unknown> = {}, list: Record<string, unknown> = {}) {
  mocks.presets = {
    boundPresetId: "p1",
    presets: [preset(over)],
    characterAvailable: true,
    ...list,
  };
}

let previewAnswer: Promise<unknown> = Promise.resolve({
  success: true,
  imageUrl: "https://cdn.test/p.webp",
  concept: "c",
});

function routeApiFetch(request: Request) {
  const { path } = request;
  if (path === "/structura/v1/visual-signature/suggest") {
    return Promise.resolve({ suggestion: SUGGESTION, homepageRead: true });
  }
  if (path === "/structura/v1/visual-signature/preview") return previewAnswer;
  if (path.startsWith("/structura/v1/analytics/usage")) {
    return Promise.resolve({
      success: true,
      plan: "byok",
      cycleUsage: { kind: "none", reason: "x" },
    });
  }
  if (path.startsWith("/structura/v1/visual-presets/p1/character")) return mocks.character(request);
  return Promise.resolve({});
}

/** apiFetch's rejection for a refusal the plugin forwarded from the cloud. */
const refusal = (status: number, code: string) => ({
  code: "cloud_error",
  message: "Refused.",
  data: { status, code },
});

/** The character route calls, as `METHOD suffix` with their bodies. */
const characterCalls = () =>
  mocks.character.mock.calls.map((call) => {
    const request = call[0] as Request;
    return {
      route: `${request.method ?? "GET"} ${request.path.replace("/structura/v1/visual-presets/p1/character", "")}`,
      data: request.data,
    };
  });

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <VisualsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const who = () => screen.getByRole("radiogroup", { name: "Who appears in your images?" });
const whoOption = (label: string) =>
  within(who()).getByRole("radio", { name: new RegExp(`^${label}`) });
const grid = () => screen.getByRole("radiogroup", { name: "Signature" });
const card = (name: string) => within(grid()).getByRole("radio", { name: new RegExp(`^${name}`) });
const save = () => screen.getByRole("button", { name: /Save Changes/ });
const lastContent = () =>
  (mocks.update.mock.calls.at(-1)![0] as { content: Record<string, unknown> }).content;
const drawButton = () => screen.getByRole("button", { name: /^Draw character sheet/ });
const nameField = () => screen.getByRole("textbox", { name: "Name" });
const descriptionField = () => screen.getByRole("textbox", { name: /^Description/ });
const consent = () =>
  screen.getByRole("checkbox", { name: /This is me, or I have this person’s permission/ });
const selectPerson = () => fireEvent.click(whoOption("Person"));
const previewCalls = () =>
  mocks.apiFetch.mock.calls.filter(
    ([arg]) => arg?.path === "/structura/v1/visual-signature/preview"
  );

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

/** Picks a file through the first empty slot's hidden input. */
const pick = (file: File) => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [file] } });
};

beforeEach(() => {
  mocks.apiFetch.mockReset().mockImplementation(routeApiFetch);
  mocks.character.mockReset().mockResolvedValue({ success: true, draft: null });
  mocks.license = { plan: "byok", isPaidLicense: true };
  mocks.update.mockReset().mockResolvedValue({});
  mocks.fork.mockReset().mockResolvedValue({ preset: { presetId: "p-fork" } });
  previewAnswer = Promise.resolve({
    success: true,
    imageUrl: "https://cdn.test/p.webp",
    concept: "c",
  });
  document.documentElement.lang = "";
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  bindPreset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Who appears (handoff §3)", () => {
  it("defaults to Nobody: no character section, the unfiltered grid with Free prompt and Our pick", async () => {
    renderPage();
    expect(whoOption("Nobody")).toHaveAttribute("aria-checked", "true");
    expect(whoOption("Person")).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Your character" })).toBeNull();
    expect(within(grid()).getAllByRole("radio")).toHaveLength(6);
    expect(screen.getByRole("button", { name: /^Free prompt/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(card("Paper cut")).toHaveAccessibleDescription(/Our pick for your brand/)
    );
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("sits before the signature, and the character section between signature and palette", () => {
    renderPage();
    selectPerson();
    const order = [
      "Who appears in your images?",
      "Signature",
      "Your character",
      "Brand palette",
      "Preview",
    ].map((name) => screen.getByRole("heading", { name }));
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  it("locks Person and Mascot on the free plan with the paid-plans row", () => {
    mocks.license = { plan: "free", isPaidLicense: false };
    renderPage();
    expect(whoOption("Person")).toBeDisabled();
    expect(whoOption("Mascot")).toBeDisabled();
    expect(whoOption("Nobody")).toBeEnabled();
    const row = screen
      .getByText(/A recurring character is part of paid plans/)
      .closest("div")!.parentElement!;
    expect(
      within(row)
        .getByRole("link", { name: /Upgrade plan/ })
        .getAttribute("href")
    ).toContain("intent=unlock_visuals");
  });

  it("explains a site whose image setup cannot draw a character, with a link to AI Engine", () => {
    bindPreset({}, { characterAvailable: false });
    renderPage();
    expect(whoOption("Person")).toBeDisabled();
    expect(screen.getByText(/can’t work from a reference image/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open AI Engine/ })).toHaveAttribute(
      "href",
      "/ai-engine"
    );
  });

  it("offers no character on an unbound site, or from a cloud that predates it", () => {
    mocks.presets = { boundPresetId: null, presets: [], characterAvailable: true };
    const view = renderPage();
    expect(screen.queryByRole("radiogroup", { name: "Who appears in your images?" })).toBeNull();
    view.unmount();
    bindPreset({}, { characterAvailable: undefined });
    renderPage();
    expect(screen.queryByRole("radiogroup", { name: "Who appears in your images?" })).toBeNull();
  });

  it("keeps a saved character with Nobody, says so politely and offers Remove there", () => {
    bindPreset({ signature: INK, appearance: "nobody", character: LENA });
    renderPage();
    const kept = screen
      .getByText("Lena is saved but not used.")
      .closest('[role="status"]') as HTMLElement;
    expect(kept).toHaveTextContent("Choose Person again to bring Lena back.");
    fireEvent.click(within(kept).getByRole("button", { name: "Remove Lena" }));
    expect(screen.getByText("Remove Lena?")).toBeInTheDocument();
  });

  it("choosing Person marks the page unsaved", () => {
    renderPage();
    selectPerson();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(whoOption("Nobody"));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });
});

describe("filtered signature grid (handoff §4)", () => {
  it("shows only the character signatures and Your own, no Free prompt, no Our pick, with the info lines", async () => {
    renderPage();
    await waitFor(() => expect(card("Paper cut")).toHaveAccessibleDescription(/Our pick/));
    selectPerson();
    const radios = within(grid()).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(card("Paper cut")).not.toHaveAccessibleDescription(/Our pick/);
    expect(screen.queryByRole("button", { name: /^Free prompt/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Your own/ })).toHaveTextContent(
      "Set the technique, motifs and framing yourself, as an illustration or a 3D render."
    );
    expect(
      screen.getByText(/Only styles that can draw a character the same way every time/)
    ).toHaveTextContent(
      "Your current style, Editorial reportage, is one of them, so pick a new one here."
    );
    // The house photo style is hidden: nothing is checked and every card stays tabbable.
    for (const radio of radios) {
      expect(radio).toHaveAttribute("aria-checked", "false");
      expect(radio).toHaveAttribute("tabindex", "0");
    }
  });

  it("Your own opens the builder with only Illustration and 3D render", () => {
    renderPage();
    selectPerson();
    fireEvent.click(screen.getByRole("button", { name: /^Your own/ }));
    expect(screen.queryByRole("radio", { name: "Photography" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Illustration" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: "3D render" })).toBeInTheDocument();
  });
});

describe("Save refusals, in the handoff's order (§2)", () => {
  it("1. no style: the error line above the grid, the group invalid, focus on its first card, nothing sent", async () => {
    renderPage();
    selectPerson();
    fireEvent.click(save());
    expect(mocks.update).not.toHaveBeenCalled();
    const line = screen.getByRole("alert");
    expect(line).toHaveTextContent("Pick one of these styles before you save.");
    expect(grid()).toHaveAttribute("aria-invalid", "true");
    expect(grid().getAttribute("aria-describedby")).toBe(line.id);
    await waitFor(() => expect(card("Paper cut")).toHaveFocus());
    fireEvent.click(card("Ink and fill"));
    expect(screen.queryByText("Pick one of these styles before you save.")).toBeNull();
    expect(grid()).not.toHaveAttribute("aria-invalid");
  });

  it("2. a sheet drawn for another style: the notice's primary takes focus, the error line under it", async () => {
    bindPreset({ signature: INK, appearance: "person", character: LENA });
    renderPage();
    fireEvent.click(card("Paper cut"));
    const primary = await screen.findByRole("button", { name: "Draw Lena in Paper cut · 1 image" });
    expect(screen.getByText("New sheet needed")).toBeInTheDocument();
    fireEvent.click(save());
    expect(mocks.update).not.toHaveBeenCalled();
    await waitFor(() => expect(primary).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Approve a sheet in Paper cut first, or keep Ink and fill."
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep Ink and fill" }));
    expect(card("Ink and fill")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Lena was drawn in Ink and fill.")).toBeNull();
  });

  it("3. not finished: the line under the next-step button, which takes focus", async () => {
    renderPage();
    selectPerson();
    fireEvent.click(card("Ink and fill"));
    fireEvent.click(save());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Finish the character first, or choose Nobody."
    );
    await waitFor(() => expect(drawButton()).toHaveFocus());
  });

  it("an as-is character needs no new sheet; a status line says so and Save sends no character fields", async () => {
    bindPreset({
      signature: INK,
      appearance: "person",
      character: { ...LENA, reference: "asIs", sheet: undefined },
    });
    renderPage();
    fireEvent.click(card("Paper cut"));
    expect(screen.queryByText(/was drawn in/)).toBeNull();
    expect(
      screen
        .getByText("Lena uses your image as it is, so no new sheet is needed for this style.")
        .closest('[role="status"]')
    ).not.toBeNull();
    fireEvent.click(save());
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastContent().signature).toEqual({ kind: "curated", id: "paper-cut", version: 1 });
    expect(lastContent()).not.toHaveProperty("character");
    expect(lastContent()).not.toHaveProperty("appearance");
  });
});

describe("intake (handoff §5)", () => {
  it("Draw without an image puts the error on the first slot and focuses it", async () => {
    renderPage();
    selectPerson();
    fireEvent.click(drawButton());
    expect(screen.getByText("Add at least one image.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add image (1 of 3)" })).toHaveFocus()
    );
    expect(characterCalls()).toEqual([]);
  });

  it("with images: no style goes to the grid, then Name, then the consent checkbox; nothing is drawn", async () => {
    bindPreset({ appearance: "nobody", characterDraft: draftOf(1) });
    renderPage();
    selectPerson();
    fireEvent.click(drawButton());
    await waitFor(() => expect(card("Paper cut")).toHaveFocus());

    fireEvent.click(card("Ink and fill"));
    fireEvent.click(drawButton());
    await waitFor(() => expect(nameField()).toHaveFocus());
    expect(screen.getByText("Give the character a name.")).toBeInTheDocument();

    fireEvent.change(nameField(), { target: { value: "Lena" } });
    fireEvent.change(descriptionField(), { target: { value: "A woman with a dark bob." } });
    fireEvent.click(drawButton());
    await waitFor(() => expect(consent()).toHaveFocus());
    expect(consent()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Confirm this before we use these images.")).toBeInTheDocument();
    expect(characterCalls()).toEqual([]);
  });

  it("refuses HEIC, other types and files over 10 MB in the slot, sending nothing", () => {
    renderPage();
    selectPerson();
    pick(new File(["x"], "IMG_0001.HEIC", { type: "" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "HEIC is an iPhone photo format we can’t use."
    );
    pick(new File(["x"], "anim.gif", { type: "image/gif" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This file type can’t be used.");
    const big = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 14.2 * 1024 * 1024 });
    pick(big);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This image is 14.2 MB. Use one under 10 MB."
    );
    expect(screen.getByRole("button", { name: "Choose another" })).toBeInTheDocument();
    expect(characterCalls()).toEqual([]);
  });

  it("a file the browser cannot decode gets the wrong-type state", async () => {
    stubImageDecoding({ decodes: false });
    renderPage();
    selectPerson();
    pick(new File(["not an image"], "photo.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This file type can’t be used.");
    expect(characterCalls()).toEqual([]);
  });

  it("uploads the shrunk image through the plugin route, shows it, and drafts the description in the admin's language", async () => {
    document.documentElement.lang = "de-DE";
    const sizes = stubImageDecoding({ decodes: true, width: 4032, height: 3024 });
    mocks.character.mockImplementation(async ({ path }: Request) =>
      path.endsWith("/description")
        ? { success: true, description: "A woman with a dark bob and red glasses." }
        : { success: true, draft: draftOf(1) }
    );
    renderPage();
    selectPerson();
    pick(new File(["photo"], "lena-front.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(characterCalls().length).toBeGreaterThanOrEqual(1));
    const [uploadCall] = characterCalls();
    expect(uploadCall!.route).toBe("POST /images");
    expect(uploadCall!.data).toMatchObject({ kind: "person" });
    expect(uploadCall!.data!.data_uri).toMatch(/^data:image\/jpeg;base64,/);
    expect(sizes[0]).toEqual({ width: 1536, height: 1152 });
    expect(await screen.findByRole("button", { name: "Remove image 1" })).toBeInTheDocument();
    expect(screen.getByText("lena-front.jpg")).toBeInTheDocument();
    await waitFor(() =>
      expect(descriptionField()).toHaveValue("A woman with a dark bob and red glasses.")
    );
    expect(characterCalls()[1]).toEqual({
      route: "POST /description",
      data: { kind: "person", locale: "de" },
    });
    expect(screen.getByText("Drafted from your images")).toBeInTheDocument();
    fireEvent.change(descriptionField(), { target: { value: "A woman with a bob." } });
    expect(screen.queryByText("Drafted from your images")).toBeNull();
  });

  it("puts the cloud's own refusal of the bytes in the slot", async () => {
    stubImageDecoding({ decodes: true });
    mocks.character.mockRejectedValue(refusal(400, "visualCharacter.imageHeic"));
    renderPage();
    selectPerson();
    pick(new File(["x"], "renamed.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "HEIC is an iPhone photo format we can’t use."
    );
  });

  it("toasts the translated message for any other upload refusal", async () => {
    stubImageDecoding({ decodes: true });
    mocks.character.mockRejectedValue(refusal(409, "visualCharacter.tooManyImages"));
    renderPage();
    selectPerson();
    pick(new File(["x"], "fourth.jpg", { type: "image/jpeg" }));
    expect(
      await screen.findByText(
        "A character can have up to three images. Remove one before adding another."
      )
    ).toBeInTheDocument();
  });

  it("removes an upload by its slot", async () => {
    bindPreset({ characterDraft: draftOf(2) });
    mocks.character.mockResolvedValue({ success: true, draft: draftOf(1) });
    renderPage();
    selectPerson();
    fireEvent.click(screen.getByRole("button", { name: "Remove image 2" }));
    await waitFor(() =>
      expect(characterCalls()).toEqual([{ route: "DELETE /images/1", data: undefined }])
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove image 2" })).toBeNull()
    );
  });

  it("a mascot has the rights statement and Keep its own drawing style, no Outfit", () => {
    renderPage();
    fireEvent.click(whoOption("Mascot"));
    expect(
      screen.getByRole("checkbox", { name: /I own this artwork or have the right to use it/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Outfit" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /Keep its own drawing style/ }));
    expect(
      screen.getByRole("radio", { name: /^Draw a character sheet in its own style/ })
    ).toBeInTheDocument();
  });
});

/** A person ready to draw: Ink and fill, two uploads, name, description and consent. */
function readyPerson() {
  bindPreset({ signature: INK, characterDraft: draftOf(2) });
  renderPage();
  selectPerson();
  fireEvent.change(nameField(), { target: { value: "Lena" } });
  fireEvent.change(descriptionField(), {
    target: { value: "A woman with a dark bob and red glasses." },
  });
  fireEvent.click(consent());
}

describe("sheet approval (handoff §6)", () => {
  it("draws with the unsaved signature and consent, shows it rendering, then Approve leads to the card and Save sends it", async () => {
    let finish!: (value: unknown) => void;
    mocks.character.mockImplementation(({ path }: Request) =>
      path.endsWith("/sheet")
        ? new Promise((resolve) => (finish = resolve))
        : Promise.resolve({
            success: true,
            draft: draftOf(2, { ...SHEET, approvedAt: "2026-11-18T10:00:00.000Z" }),
          })
    );
    readyPerson();
    fireEvent.click(drawButton());

    await waitFor(() =>
      expect(characterCalls()).toEqual([
        { route: "POST /sheet", data: { kind: "person", signature: INK, confirmed: true } },
      ])
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Your character" })).toHaveFocus()
    );
    expect(
      screen
        .getByText(/Drawing three full-length views and two close-ups of Lena/)
        .closest('[role="status"]')
    ).not.toBeNull();
    // Rendering first: no Approve, no Try again.
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Try again/ })).toBeNull();

    await act(async () => finish({ success: true, draft: draftOf(2, SHEET) }));
    expect(screen.getByRole("heading", { name: "Does this look like Lena?" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /^Character sheet of Lena in Ink and fill: front, three-quarter and back views/,
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    const replace = await screen.findByRole("button", { name: "Replace Lena" });
    await waitFor(() => expect(replace).toHaveFocus());
    expect(characterCalls().at(-1)).toEqual({ route: "POST /sheet/approve", data: undefined });
    expect(screen.getByText(/^Drawn in Ink and fill\. Sheet approved on/)).toBeInTheDocument();
    // Approve does not save.
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Previews show the style without a character until a character sheet is approved."
      )
    ).toBeNull();

    fireEvent.click(save());
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastContent()).toMatchObject({
      signature: INK,
      appearance: "person",
      character: {
        name: "Lena",
        description: "A woman with a dark bob and red glasses.",
        reference: "sheet",
        outfit: "same",
        confirmed: true,
      },
    });
  });

  it("a failed first sheet says it used no image and makes Try again the primary", async () => {
    mocks.character.mockRejectedValue(refusal(500, "visualCharacter.sheetFailed"));
    readyPerson();
    fireEvent.click(drawButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The sheet didn’t finish. Try again in a moment.");
    expect(alert).toHaveTextContent("This didn’t use an image.");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Try again/ }).className).toContain("bg-brand-600");
  });

  it("a request that never answered (no error key) is a failed sheet too, and the previous one stays approvable", async () => {
    mocks.character.mockResolvedValueOnce({ success: true, draft: draftOf(2, SHEET) });
    readyPerson();
    fireEvent.click(drawButton());
    await screen.findByRole("button", { name: "Approve" });
    mocks.character.mockRejectedValueOnce({
      code: "fetch_error",
      message: "You are probably offline.",
    });
    fireEvent.click(screen.getByRole("button", { name: /^Try again/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The new sheet didn’t finish");
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("a refusal that is not a failed render toasts its message and returns to the images", async () => {
    mocks.character.mockRejectedValue(refusal(409, "visualCharacter.modelUnavailable"));
    readyPerson();
    fireEvent.click(drawButton());
    expect(
      await screen.findByText(
        "The image setup on your website can’t work from a reference image. Switch to one that can under AI Engine to add a character."
      )
    ).toBeInTheDocument();
    expect(drawButton()).toBeInTheDocument();
  });

  it("the zoom dialog switches with the arrow keys and announces each switch", async () => {
    mocks.character.mockResolvedValue({ success: true, draft: draftOf(2, SHEET) });
    readyPerson();
    fireEvent.click(drawButton());
    fireEvent.click(await screen.findByRole("button", { name: "View the character sheet larger" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Character sheet · Ink and fill")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Character sheet" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    const close = within(dialog).getByRole("button", { name: "Close" });
    fireEvent.keyDown(close, { key: "ArrowRight" });
    expect(within(dialog).getByText("Your image 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByText("Showing Your image 1, 2 of 3")).toBeInTheDocument();
    fireEvent.keyDown(close, { key: "End" });
    expect(within(dialog).getByRole("button", { name: "Your image 2" })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });
});

describe("as is (handoff §5)", () => {
  it("Use these images finishes the character without a sheet and Save sends asIs", async () => {
    readyPerson();
    fireEvent.click(screen.getByRole("radio", { name: /^Use my image as it is/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use these images" }));
    expect(screen.getByText("Uses your image as it is.")).toBeInTheDocument();
    expect(characterCalls()).toEqual([]);
    fireEvent.click(save());
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastContent()).toMatchObject({
      appearance: "person",
      character: { reference: "asIs", confirmed: true },
    });
  });
});

describe("the card, Replace and Remove (handoff §6.2, §6.3)", () => {
  it("shows the saved character with its sheet, uploads, Replace and Remove", () => {
    bindPreset({ signature: INK, appearance: "person", character: LENA });
    renderPage();
    expect(screen.getByText("Lena")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^View your image \d larger$/ })).toHaveLength(3);
    expect(screen.getByText("Kept until you remove Lena.")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("Replace opens the intake on the kept images, asks for the statement again, and Cancel goes back", async () => {
    bindPreset({ signature: INK, appearance: "person", character: LENA });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Replace Lena" }));
    expect(nameField()).toHaveValue("Lena");
    expect(screen.getAllByRole("button", { name: /^Remove image/ })).toHaveLength(3);
    expect(consent()).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Cancel and keep Lena" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Replace Lena" })).toHaveFocus());
  });

  it("Remove confirms what is deleted, on all sites of a shared preset, then goes back to Nobody at once", async () => {
    bindPreset({ signature: INK, appearance: "person", character: LENA, boundActivationCount: 3 });
    mocks.character.mockResolvedValue({ success: true, ok: true });
    renderPage();
    // An unsaved edit elsewhere stays unsaved.
    fireEvent.click(screen.getByRole("switch", { name: "Label images as AI-generated" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Lena" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/the 3 images you uploaded and the character sheet\./)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/images already published on your website/)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Lena is removed from all 3 sites that use this preset.")
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Keep Lena" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Remove Lena$/ }));
    await waitFor(() => expect(characterCalls()).toEqual([{ route: "DELETE ", data: undefined }]));
    await waitFor(() => expect(whoOption("Nobody")).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(whoOption("Nobody")).toHaveFocus());
    expect(screen.getByText("Lena was removed.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your character" })).toBeNull();
    expect(within(grid()).getAllByRole("radio")).toHaveLength(6);
    expect(screen.queryByText(/is saved but not used/)).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("a failed Remove toasts and changes nothing", async () => {
    bindPreset({ signature: INK, appearance: "person", character: LENA });
    mocks.character.mockRejectedValue({
      code: "cloud_unreachable",
      message: "x",
      data: { status: 502 },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Remove Lena" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: /^Remove Lena$/ })
    );
    expect(
      await screen.findByText(
        "Lena couldn’t be removed. Nothing was deleted. Try again in a moment."
      )
    ).toBeInTheDocument();
    expect(whoOption("Person")).toHaveAttribute("aria-checked", "true");
  });
});

describe("shared warning, preview and the Nobody site (handoff §8)", () => {
  it("names the character in the shared warning and says the copy goes without it", () => {
    bindPreset({ signature: INK, appearance: "person", character: LENA, boundActivationCount: 2 });
    renderPage();
    expect(screen.getByText(/Lena appears in new images on all 2 sites\./)).toBeInTheDocument();
    expect(
      screen.getByText("A copy is saved without the character, which stays with this preset.")
    ).toBeInTheDocument();
  });

  it("Save as new for this site sends the content without the character fields", async () => {
    bindPreset({ signature: INK, appearance: "person", character: LENA, boundActivationCount: 2 });
    renderPage();
    fireEvent.click(whoOption("Nobody"));
    fireEvent.click(screen.getByRole("button", { name: /Save as new for this site only/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0]![0]).toMatchObject({ preset_id: "p-fork" });
    expect(lastContent()).not.toHaveProperty("appearance");
    expect(lastContent()).not.toHaveProperty("character");
  });

  it("a Nobody site's preview and Save send nothing about a character", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Preview with my colors/ }));
    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    expect(previewCalls()[0]![0].data).toEqual({ signature: HOUSE, palette: PALETTE });
    fireEvent.click(screen.getByRole("switch", { name: "Label images as AI-generated" }));
    fireEvent.click(save());
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastContent()).not.toHaveProperty("appearance");
    expect(lastContent()).not.toHaveProperty("character");
  });

  it("previews without a character until one is finished, with the pending line", async () => {
    previewAnswer = new Promise(() => {});
    renderPage();
    selectPerson();
    fireEvent.click(card("Ink and fill"));
    expect(
      screen.getByText(
        "Previews show the style without a character until a character sheet is approved."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Preview with my colors/ }));
    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    expect(previewCalls()[0]![0].data).toMatchObject({ appearance: "nobody" });
  });

  it("previews a finished unsaved character from the draft with consent, and renders the data URL", async () => {
    previewAnswer = Promise.resolve({
      success: true,
      imageUrl: "data:image/webp;base64,UklGRg==",
      concept: "Lena at work",
    });
    readyPerson();
    fireEvent.click(screen.getByRole("radio", { name: /^Use my image as it is/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use these images" }));
    fireEvent.click(screen.getByRole("button", { name: /Preview with my colors/ }));
    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    expect(previewCalls()[0]![0].data).toMatchObject({
      appearance: "person",
      character: {
        name: "Lena",
        reference: "asIs",
        description: "A woman with a dark bob and red glasses.",
      },
      useCharacterDraft: true,
      confirmed: true,
    });
    expect(await screen.findByRole("img", { name: "Lena at work" })).toHaveAttribute(
      "src",
      "data:image/webp;base64,UklGRg=="
    );
  });
});
