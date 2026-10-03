/**
 * ActiveQueue — the "Intelligence" column by plan (2026-10-02).
 *
 * `model_slug` on a queued job is the campaign's text provider id (the
 * plugin's `GET /structura/v1/jobs`). Managed plans (Cloud, Cloud Pro) never
 * see a provider or model name (specs/managed-ai-lineup.md §3.3), so the
 * column and its header go, as in RecentBlueprints. Found in the local
 * wp-admin walkthrough on a Cloud Pro site: the row read "openai".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const planMock = vi.hoisted(() => ({ plan: "byok" }));
vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: planMock.plan }),
}));

import { ActiveQueue } from "../components/ActiveQueue";
import type { Job } from "@/features/campaigns";

const job = (over: Partial<Job> = {}): Job =>
  ({
    id: 1,
    campaign_id: 7,
    campaign_name: "Apartment Harvest",
    model_slug: "openai",
    persona_id: null,
    generate_images: true,
    topic: "",
    status: "pending",
    formatted_date: "Oct 5, 1:50 PM",
    ...over,
  }) as Job;

beforeEach(() => {
  planMock.plan = "byok";
});

describe("ActiveQueue — Intelligence column", () => {
  it("BYOK: shows the column and the provider id", () => {
    render(<ActiveQueue jobs={[job()]} />);
    expect(screen.getByText("Intelligence")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
  });

  it.each(["cloud", "cloud_pro"])("managed plan %s: no column, no provider id", (plan) => {
    planMock.plan = plan;
    render(<ActiveQueue jobs={[job()]} />);
    expect(screen.queryByText("Intelligence")).toBeNull();
    expect(screen.queryByText("openai")).toBeNull();
    expect(screen.getByText("Apartment Harvest")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });

  it("BYOK with a blank provider renders an empty cell", () => {
    const { container } = render(<ActiveQueue jobs={[job({ model_slug: "" })]} />);
    const cells = container.querySelectorAll("tbody tr td");
    expect(cells[1]?.textContent).toBe("");
    expect(cells[1]?.children).toHaveLength(0);
  });

  it("managed empty queue spans the remaining three columns", () => {
    planMock.plan = "cloud_pro";
    render(<ActiveQueue jobs={[]} />);
    expect(screen.getByText("Queue is currently empty.").getAttribute("colspan")).toBe("3");
  });
});
