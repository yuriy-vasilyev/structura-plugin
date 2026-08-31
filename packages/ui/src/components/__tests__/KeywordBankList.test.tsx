/**
 * KeywordBankList / KeywordRow / MetricChip — the ranked keyword bank
 * (design handoff `marketing/design_handoff_keyword_bank`). Pins the derived
 * KD state, the collapse/expand contract, the AI-estimated degrade (no holes),
 * the pillars split and the focus handoff on remove — the behaviour both
 * surfaces rely on. Rendered behaviour (fade, container query, hover reveal)
 * is covered browser-real in `web/e2e/keyword-bank.spec.ts`.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { deriveKdState } from "../MetricChip";
import { bucketForVolume, formatCompactVolume } from "../KeywordRow";
import { KeywordBankList, type KeywordBankItem } from "../KeywordBankList";

function bank(n: number, opts: { pillars?: number; kd?: (i: number) => number } = {}): KeywordBankItem[] {
  const items: KeywordBankItem[] = Array.from({ length: n }, (_, i) => ({
    keyword: `keyword ${i + 1}`,
    source: i % 3 === 0 ? "competitor_gap" : "related_search",
    metrics: {
      volumeNumber: 5000 - i * 100,
      kd: opts.kd ? opts.kd(i) : 20 + (i % 30),
      intent: i % 2 ? "commercial" : "informational",
    },
    variantCount: i % 4,
  }));
  for (let p = 0; p < (opts.pillars ?? 0); p++) {
    items.push({
      keyword: `pillar ${p + 1}`,
      source: "competitor_gap",
      metrics: { volumeNumber: 14500, kd: 78 + p, intent: "commercial" },
      variantCount: 3,
    });
  }
  return items;
}

describe("deriveKdState", () => {
  it("is relative to the ceiling, never absolute", () => {
    expect(deriveKdState(52, 65)).toBe("stretch");
    expect(deriveKdState(52, 40)).toBe("pillar");
    expect(deriveKdState(45, 65)).toBe("winnable");
    expect(deriveKdState(65, 65)).toBe("stretch"); // ≤ ceiling
    expect(deriveKdState(66, 65)).toBe("pillar");
    expect(deriveKdState(45, 65)).toBe("winnable"); // exactly ceiling − 20
    expect(deriveKdState(46, 65)).toBe("stretch");
  });

  it("authority mode (null ceiling) and missing KD are always winnable", () => {
    expect(deriveKdState(90, null)).toBe("winnable");
    expect(deriveKdState(90, undefined)).toBe("winnable");
    expect(deriveKdState(undefined, 40)).toBe("winnable");
  });
});

describe("formatCompactVolume / bucketForVolume", () => {
  it("fits a 42px mono column: 2.9K / 14.5K / 980, localized decimal separator", () => {
    expect(formatCompactVolume(2900, "en")).toBe("2.9K");
    expect(formatCompactVolume(14500, "en")).toBe("14.5K");
    expect(formatCompactVolume(1000, "en")).toBe("1K");
    expect(formatCompactVolume(980, "en")).toBe("980");
    expect(formatCompactVolume(2900, "de")).toBe("2,9K");
  });

  it("buckets volumes like the legacy chip badge (≥1000 high, ≥100 medium)", () => {
    expect(bucketForVolume(1000)).toBe("high");
    expect(bucketForVolume(999)).toBe("medium");
    expect(bucketForVolume(99)).toBe("low");
  });
});

describe("KeywordBankList — live data", () => {
  it("renders the full row anatomy: position, keyword, provenance, +N, volume, KD, intent", () => {
    render(<KeywordBankList items={bank(3)} kdCeiling={65} onRemove={vi.fn()} onMoveToTop={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Keyword bank, in publish order" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const first = rows[0];
    expect(first).toHaveAttribute("data-position", "1");
    expect(first).toHaveTextContent("01");
    expect(first).toHaveTextContent("keyword 1");
    expect(first.querySelector("[data-provenance]")).toHaveAttribute("data-provenance", "competitor_gap");
    expect(first.querySelector("[data-volume]")).toHaveTextContent("5K");
    expect(first.querySelector("[data-kd-state]")).toHaveAttribute("data-kd-state", "winnable");
    expect(first.querySelector("[data-intent]")).toHaveTextContent("DIY");
    // Row 2 has variantCount 1 → "+1"; row 1 has 0 → no signal.
    expect(rows[1].querySelector("[data-variants]")).toHaveTextContent("+1");
    expect(first.querySelector("[data-variants]")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove keyword 1" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move keyword 1 to the top of the publish order" })
    ).toBeInTheDocument();
  });

  it("tints the KD meter relative to the ceiling (stretch / pillar)", () => {
    const items: KeywordBankItem[] = [
      { keyword: "easy", source: "related_search", metrics: { kd: 20 } },
      { keyword: "near", source: "related_search", metrics: { kd: 52 } },
    ];
    render(<KeywordBankList items={items} kdCeiling={65} onRemove={vi.fn()} />);
    const states = Array.from(document.querySelectorAll("[data-kd-state]")).map((el) =>
      el.getAttribute("data-kd-state")
    );
    expect(states).toEqual(["winnable", "stretch"]);
  });

  it("collapses to the first 15 with 'Show all N' and reveals the rest + pillars on expand, keeping focus on the toggle", () => {
    render(<KeywordBankList items={bank(39, { pillars: 3 })} kdCeiling={65} onRemove={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Keyword bank, in publish order" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(15);
    expect(list).toHaveAttribute("data-collapsed");
    expect(screen.queryByRole("list", { name: "Pillar keywords" })).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show all 42 keywords" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", list.id);
    expect(screen.getByText("27 more · 3 pillars publish last")).toBeInTheDocument();

    toggle.focus();
    fireEvent.click(toggle);

    expect(within(list).getAllByRole("listitem")).toHaveLength(39);
    const pillarList = screen.getByRole("list", { name: "Pillar keywords" });
    const pillarRows = within(pillarList).getAllByRole("listitem");
    expect(pillarRows.map((r) => r.getAttribute("data-position"))).toEqual(["40", "41", "42"]);
    expect(pillarRows[0]).toHaveAttribute("data-pillar");
    expect(pillarRows[0].querySelector("[data-kd-state]")).toHaveAttribute("data-kd-state", "pillar");
    expect(screen.getByText("Pillars")).toBeInTheDocument();

    const collapseToggle = screen.getByRole("button", { name: "Show top 15 only" });
    expect(collapseToggle).toHaveAttribute("aria-expanded", "true");
    // Same element, same focus — the toggle is never swapped out.
    expect(collapseToggle).toBe(toggle);
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(collapseToggle);
    expect(within(list).getAllByRole("listitem")).toHaveLength(15);
  });

  it("≤ 15 keywords: no toggle, pillars group shown immediately", () => {
    render(<KeywordBankList items={bank(5, { pillars: 2 })} kdCeiling={40} onRemove={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Pillar keywords" })).toBeInTheDocument();
  });

  it("pillar rows have no move-to-top; authority mode (null ceiling) has no pillars at all", () => {
    const { unmount } = render(
      <KeywordBankList items={bank(2, { pillars: 1 })} kdCeiling={65} onRemove={vi.fn()} onMoveToTop={vi.fn()} />
    );
    expect(
      screen.queryByRole("button", { name: "Move pillar 1 to the top of the publish order" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove pillar 1" })).toBeInTheDocument();
    unmount();

    render(<KeywordBankList items={bank(2, { pillars: 1 })} kdCeiling={null} onRemove={vi.fn()} />);
    expect(screen.queryByRole("list", { name: "Pillar keywords" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-kd-state='pillar']")).toBeNull();
  });

  it("sums variant counts into the variants line", () => {
    const items: KeywordBankItem[] = [
      { keyword: "a", source: "manual", variantCount: 3 },
      { keyword: "b", source: "manual", variantCount: 2 },
    ];
    render(<KeywordBankList items={items} onRemove={vi.fn()} />);
    expect(screen.getByText(/5 long-tail variants ready/)).toBeInTheDocument();
  });

  it("announces move-to-top politely and calls the handler", () => {
    const onMoveToTop = vi.fn();
    render(<KeywordBankList items={bank(3)} kdCeiling={65} onRemove={vi.fn()} onMoveToTop={onMoveToTop} />);
    fireEvent.click(screen.getByRole("button", { name: "Move keyword 2 to the top of the publish order" }));
    expect(onMoveToTop).toHaveBeenCalledWith("keyword 2");
  });

  it("renders the mode caption with its tooltip trigger", () => {
    render(
      <KeywordBankList
        items={bank(2)}
        kdCeiling={65}
        modeCaption="Balanced · KD ≤ 65"
        modeTooltip="Difficulty mode resolved from this site's footprint."
        onRemove={vi.fn()}
      />
    );
    const caption = screen.getByText("Balanced · KD ≤ 65");
    expect(caption).toHaveAttribute("tabindex", "0");
    expect(caption).toHaveAttribute("aria-label", "Difficulty mode resolved from this site's footprint.");
    expect(screen.getByText("Publish order · best winnable volume first")).toBeInTheDocument();
  });
});

describe("KeywordBankList — partial live metrics (live QA 2026-08-28)", () => {
  it("keeps the three fixed metric slots when a row has only a KD or only a volume, and labels the volume", () => {
    const items: KeywordBankItem[] = [
      { keyword: "full", source: "related_search", metrics: { volumeNumber: 2900, kd: 28, intent: "informational" } },
      { keyword: "kd only", source: "related_search", metrics: { kd: 40 } },
      { keyword: "volume only", source: "related_search", metrics: { volumeNumber: 0 } },
      { keyword: "nothing", source: "manual" },
    ];
    render(<KeywordBankList items={items} kdCeiling={65} onRemove={vi.fn()} />);
    const rows = screen.getAllByRole("listitem");
    for (const i of [0, 1, 2]) {
      expect(rows[i].querySelector("[data-volume-slot]")).not.toBeNull();
      expect(rows[i].querySelector("[data-kd-slot]")).not.toBeNull();
      expect(rows[i].querySelector("[data-intent-slot]")).not.toBeNull();
    }
    expect(rows[1].querySelector("[data-volume]")).toBeNull();
    expect(rows[1].querySelector("[data-kd-state]")).toHaveAttribute("data-kd-state", "winnable");
    expect(rows[2].querySelector("[data-volume]")).toHaveAttribute("aria-label", "0 monthly searches");
    expect(rows[0].querySelector("[data-volume]")).toHaveAttribute("aria-label", "2.9K monthly searches");
    // No metric at all → no slots (no holes, no empty wrapped line).
    expect(rows[3].querySelector("[data-metrics]")?.childElementCount).toBe(0);
  });
});

describe("KeywordBankList — AI-estimated degrade", () => {
  it("renders position + keyword + amber Sparkles + bucket chip only — no KD / intent / variants / pillars", () => {
    const items = bank(20, { pillars: 2 });
    render(
      <KeywordBankList items={items} estimated kdCeiling={65} modeCaption="ignored" onRemove={vi.fn()} />
    );
    // Every row is "ai_generated" regardless of the wire source.
    const prov = Array.from(document.querySelectorAll("[data-provenance]")).map((el) =>
      el.getAttribute("data-provenance")
    );
    expect(new Set(prov)).toEqual(new Set(["ai_generated"]));
    expect(document.querySelector("[data-kd-state]")).toBeNull();
    expect(document.querySelector("[data-intent]")).toBeNull();
    expect(document.querySelector("[data-variants]")).toBeNull();
    expect(document.querySelector("[data-volume]")).toBeNull();
    expect(document.querySelector("[data-bucket='high']")).toHaveTextContent("~ High");
    expect(screen.queryByText(/long-tail variants ready/)).not.toBeInTheDocument();
    expect(screen.getByText("order estimated")).toBeInTheDocument();
    expect(screen.queryByText("ignored")).not.toBeInTheDocument();
    // The "pillars" are ordinary rows here: 22 total, collapsed to 15, no group.
    expect(screen.getByRole("button", { name: "Show all 22 keywords" })).toBeInTheDocument();
    expect(screen.getByText("7 more")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all 22 keywords" }));
    expect(screen.queryByRole("list", { name: "Pillar keywords" })).not.toBeInTheDocument();
  });

  it("a row without any volume renders no metric cell at all (no holes)", () => {
    render(
      <KeywordBankList
        items={[{ keyword: "x", source: "manual" }]}
        estimated
        onRemove={vi.fn()}
      />
    );
    expect(document.querySelector("[data-metrics]")?.childElementCount).toBe(0);
  });
});

describe("KeywordBankList — pending row", () => {
  it("dims the keyword, shows a shimmer where metrics go and hides the actions", () => {
    render(
      <KeywordBankList
        items={[{ keyword: "fresh add", source: "manual", pending: true }]}
        kdCeiling={65}
        onRemove={vi.fn()}
        onMoveToTop={vi.fn()}
      />
    );
    const row = screen.getByRole("listitem");
    expect(row).toHaveAttribute("data-pending");
    expect(screen.getByRole("status", { name: "Looking up search data…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });
});

describe("KeywordBankList — remove focus handoff", () => {
  function Harness({ initial }: { initial: KeywordBankItem[] }) {
    const [items, setItems] = useState(initial);
    const inputRef = { current: null as HTMLInputElement | null };
    return (
      <>
        <input ref={(el) => (inputRef.current = el)} aria-label="Add a keyword" />
        <KeywordBankList
          items={items}
          kdCeiling={65}
          addInputRef={inputRef}
          onRemove={(k) => setItems((cur) => cur.filter((i) => i.keyword !== k))}
        />
      </>
    );
  }

  it("moves focus to the next row's remove button, the previous one for the last row, then the Add input", () => {
    render(<Harness initial={bank(3)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove keyword 2" }));
    expect(screen.queryByText("keyword 2")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove keyword 3" }));

    fireEvent.click(screen.getByRole("button", { name: "Remove keyword 3" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove keyword 1" }));

    fireEvent.click(screen.getByRole("button", { name: "Remove keyword 1" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Add a keyword" }));
  });
});
