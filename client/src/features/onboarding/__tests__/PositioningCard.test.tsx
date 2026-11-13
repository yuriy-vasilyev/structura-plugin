/**
 * PositioningCard (Site → Info) — the AI draft and the pages it read
 * (specs/site-reading.md §5a, §11).
 *
 * Owner feedback, 2026-11-13: an AI draft clearly used the site's service
 * pages, but wp-admin listed none, and its draft replaced the fields without
 * asking. The card now lists the pages read after a draft, re-selects them
 * on every draft, and asks only before replacing text the operator wrote or
 * edited. Round two (same day): before any draft it lists the site's stored
 * pages under "Pages we read from your site", as the portal does, and the
 * button reads "AI draft". The data hooks (the plugin REST edge) are mocked;
 * the card runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@structura/ui";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

const h = vi.hoisted(() => ({
  saved: null as Record<string, string> | null,
  // The read's stored pages; undefined = an older cloud or an unreadable site.
  storedPages: undefined as Array<Record<string, string>> | undefined,
  suggest: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../api/useWizardSeo", () => ({
  useWizardPositioningQuery: () => ({
    data: { positioning: h.saved, ...(h.storedPages ? { pages: h.storedPages } : {}) },
    isLoading: false,
  }),
  useSaveWizardPositioningMutation: () => ({ mutateAsync: h.save, isPending: false }),
  useSuggestWizardPositioningMutation: () => ({ mutateAsync: h.suggest, isPending: false }),
}));

import { PositioningCard } from "../components/PositioningCard";

const LOADED = {
  what: "Hand-forged kitchen knives.",
  who: "Home cooks.",
  problem: "Dull blades.",
};
const DRAFT = {
  suggestion: {
    what: "Knife sharpening service.",
    who: "Restaurants.",
    problem: "Downtime in the kitchen.",
    rationale: "",
  },
  pages: [
    { url: "https://knives.test", label: "knives.test", role: "home" },
    { url: "https://knives.test/sharpening", label: "Sharpening", role: "service" },
  ],
};

const renderCard = (source?: string) => {
  h.saved = source ? { ...LOADED, source, capturedAt: "2026-11-01" } : null;
  return render(
    <ToastProvider>
      <PositioningCard />
    </ToastProvider>,
  );
};

const draftButton = () => screen.getByRole("button", { name: "AI draft" });
const field = (label: string) => screen.getByLabelText(label) as HTMLTextAreaElement;
const WHAT = "What does your business do?";
const WHO = "Who's your typical customer?";
const confirmTitle = () => screen.queryByText("Replace your edits?");
const STORED_TITLE = "Pages we read from your site";
const DRAFTED_TITLE = "Drafted from these pages";
const STORED_PAGES = [
  { url: "https://knives.test", label: "knives.test", role: "home" },
  { url: "https://knives.test/forging", label: "Forging classes", role: "service" },
  { url: "https://knives.test/about", label: "About", role: "about" },
];

beforeEach(() => {
  h.storedPages = undefined;
  h.suggest.mockReset();
  h.save.mockReset();
  h.save.mockResolvedValue({ positioning: null });
});

describe("PositioningCard — the pages an AI draft read", () => {
  it("lists them after a draft, read-only, with their role, and asks for a fresh selection", async () => {
    h.suggest.mockResolvedValue(DRAFT);
    renderCard("ai_draft");
    expect(screen.queryByRole("list", { name: DRAFTED_TITLE })).toBeNull();

    fireEvent.click(draftButton());

    const list = await screen.findByRole("list", { name: DRAFTED_TITLE });
    expect(h.suggest).toHaveBeenCalledWith({ reselectPages: true });
    expect(within(list).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "https://knives.test",
      "https://knives.test/sharpening",
    ]);
    expect(within(list).getByText("Homepage")).toBeInTheDocument();
    expect(within(list).getByText("Service")).toBeInTheDocument();
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(field(WHAT).value).toBe("Knife sharpening service.");
    expect(await screen.findByText("Drafted from your site's pages. Review and save.")).toBeInTheDocument();
  });

  it("lists nothing when the cloud sends no pages (older cloud)", async () => {
    h.suggest.mockResolvedValue({ suggestion: DRAFT.suggestion });
    renderCard("ai_draft");

    fireEvent.click(draftButton());

    await waitFor(() => expect(field(WHAT).value).toBe("Knife sharpening service."));
    expect(screen.queryByRole("list", { name: DRAFTED_TITLE })).toBeNull();
    expect(screen.queryByRole("list", { name: STORED_TITLE })).toBeNull();
  });
});

// specs/site-reading.md §11, wp-admin positioning round two (2026-11-13).
describe("PositioningCard — the stored pages before a draft", () => {
  it("lists the site's stored pages, the homepage first, under 'Pages we read from your site'", () => {
    h.storedPages = STORED_PAGES;
    renderCard("ai_draft");

    const list = screen.getByRole("list", { name: STORED_TITLE });
    expect(within(list).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "https://knives.test",
      "https://knives.test/forging",
      "https://knives.test/about",
    ]);
    expect(within(list).getByText("Forging classes")).toBeInTheDocument();
    expect(within(list).getByText("Homepage")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: DRAFTED_TITLE })).toBeNull();
  });

  it("switches to the draft's pages under 'Drafted from these pages' after a draft", async () => {
    h.storedPages = STORED_PAGES;
    h.suggest.mockResolvedValue(DRAFT);
    renderCard("ai_draft");

    fireEvent.click(draftButton());

    const list = await screen.findByRole("list", { name: DRAFTED_TITLE });
    expect(within(list).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "https://knives.test",
      "https://knives.test/sharpening",
    ]);
    expect(screen.queryByRole("list", { name: STORED_TITLE })).toBeNull();
  });

  it("lists nothing before a draft when the read carries no pages (unreadable site, older cloud)", () => {
    renderCard("ai_draft");

    expect(screen.queryByRole("list", { name: STORED_TITLE })).toBeNull();
    expect(screen.queryByRole("list", { name: DRAFTED_TITLE })).toBeNull();
  });
});

describe("PositioningCard — asking before an AI draft replaces text", () => {
  it("re-drafts a saved AI draft that nobody changed without asking", async () => {
    h.suggest.mockResolvedValue(DRAFT);
    renderCard("ai_draft");

    fireEvent.click(draftButton());

    expect(confirmTitle()).toBeNull();
    await waitFor(() => expect(field(WHO).value).toBe("Restaurants."));
  });

  it("asks before replacing a saved AI draft edited since, and Keep mine keeps the text", () => {
    renderCard("ai_draft");
    fireEvent.change(field(WHO), { target: { value: "Home cooks and chefs." } });

    fireEvent.click(draftButton());

    expect(confirmTitle()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(h.suggest).not.toHaveBeenCalled();
    expect(field(WHO).value).toBe("Home cooks and chefs.");
  });

  it("asks before replacing a positioning the operator wrote, and Replace drafts", async () => {
    h.suggest.mockResolvedValue(DRAFT);
    renderCard("edited");

    fireEvent.click(draftButton());

    expect(confirmTitle()).toBeInTheDocument();
    expect(h.suggest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(field(WHAT).value).toBe("Knife sharpening service."));
  });

  it("asks before replacing a draft from this visit that was edited by hand", async () => {
    h.suggest.mockResolvedValue(DRAFT);
    renderCard("ai_draft");
    fireEvent.click(draftButton());
    await waitFor(() => expect(field(WHAT).value).toBe("Knife sharpening service."));

    fireEvent.change(field(WHAT), { target: { value: "Our own words." } });
    fireEvent.click(draftButton());

    expect(confirmTitle()).toBeInTheDocument();
    expect(h.suggest).toHaveBeenCalledTimes(1);
  });

  it("drafts right away on an empty card", async () => {
    h.suggest.mockResolvedValue(DRAFT);
    renderCard();

    fireEvent.click(draftButton());

    expect(confirmTitle()).toBeNull();
    await waitFor(() => expect(field(WHAT).value).toBe("Knife sharpening service."));
  });
});

describe("PositioningCard — what Save records", () => {
  it("saves an unchanged draft as an AI draft and an edited one as edited", async () => {
    h.suggest.mockResolvedValue(DRAFT);
    renderCard("user");
    fireEvent.click(draftButton());
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(field(WHAT).value).toBe("Knife sharpening service."));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save).toHaveBeenLastCalledWith(expect.objectContaining({ source: "ai_draft" }));

    fireEvent.change(field(WHO), { target: { value: "Restaurants and hotels." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    expect(h.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ who: "Restaurants and hotels.", source: "edited" }),
    );
  });
});
