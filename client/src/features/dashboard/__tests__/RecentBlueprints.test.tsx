/**
 * RecentBlueprints — the "Intelligence" column by plan (2026-10-01).
 *
 * The column shows `post.model`, which the plugin fills with the
 * campaign's text provider id. Managed plans (Cloud, Cloud Pro) never see
 * a provider or model name, so the column goes there; on BYOK a blank
 * value renders no empty badge (specs/managed-ai-lineup.md §3.3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const planMock = vi.hoisted(() => ({ plan: "byok" }));
vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: planMock.plan }),
}));

const postsMock = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock("../api/useRecentPostsQuery", () => ({
  useRecentPostsQuery: () => ({ data: postsMock.current, isLoading: false }),
}));

import { RecentBlueprints } from "../components/RecentBlueprints";

const post = (over: Record<string, unknown> = {}) => ({
  id: 1,
  title: "Pour-over grind guide",
  status: "publish",
  date: "Oct 1, 9:00 AM",
  permalink: "https://site.test/grind",
  edit_link: "https://site.test/wp-admin/post.php?post=1",
  thumbnail: null,
  author: "Editor",
  model: "anthropic",
  ...over,
});

beforeEach(() => {
  planMock.plan = "byok";
  postsMock.current = [post()];
});

describe("RecentBlueprints — Intelligence column", () => {
  it("BYOK: shows the column and the provider badge", () => {
    render(<RecentBlueprints />);

    expect(screen.getByText("Intelligence")).toBeInTheDocument();
    expect(screen.getByText("anthropic")).toBeInTheDocument();
  });

  it("managed: drops the column and never shows the provider", () => {
    planMock.plan = "cloud";
    render(<RecentBlueprints />);

    expect(screen.queryByText("Intelligence")).not.toBeInTheDocument();
    expect(screen.queryByText("anthropic")).not.toBeInTheDocument();
    expect(screen.getByText("Pour-over grind guide")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });

  it("BYOK with a blank model renders no empty badge", () => {
    postsMock.current = [post({ model: "" })];
    const { container } = render(<RecentBlueprints />);

    expect(screen.getByText("Intelligence")).toBeInTheDocument();
    const cells = container.querySelectorAll("tbody tr td");
    expect(cells[2]?.textContent).toBe("");
    expect(cells[2]?.children).toHaveLength(0);
  });

  it("managed empty state spans the remaining three columns", () => {
    planMock.plan = "cloud_pro";
    postsMock.current = [];
    render(<RecentBlueprints />);

    const cell = screen.getByText("No blueprints found in the database.");
    expect(cell.getAttribute("colspan")).toBe("3");
  });
});
