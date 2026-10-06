/**
 * SnippetBlock: setup recipes in variant tabs (a command, a JSON file, or
 * separate fields), each with a hint and a copy button. Spec: the
 * Assistant access handoff, "New shared primitives". Highlighting is
 * presentation only; copy always takes the plain text.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { SnippetBlock, type SnippetVariant } from "../SnippetBlock";

const TOKEN = "stpat_abc123";
const COMMAND = `claude mcp add --transport http structura https://mcp.example.com/mcp --header "Authorization: Bearer ${TOKEN}"`;
const JSON_CONFIG = `{\n  "mcpServers": {\n    "structura": {\n      "headers": { "Authorization": "Bearer ${TOKEN}" }\n    }\n  }\n}`;

const VARIANTS: SnippetVariant[] = [
  {
    id: "cli",
    label: "Claude Code",
    hint: "Run this in your terminal.",
    code: COMMAND,
    copiedAnnouncement: "Command copied",
  },
  {
    id: "json",
    label: "Cursor",
    hint: "Add this to mcp.json.",
    code: JSON_CONFIG,
    copiedAnnouncement: "Configuration copied",
  },
  {
    id: "fields",
    label: "Other tools",
    hint: "Use this address and header.",
    fields: [
      { label: "Server URL", value: "https://mcp.example.com/mcp" },
      { label: "Header", value: `Authorization: Bearer ${TOKEN}` },
    ],
    copiedAnnouncement: "Settings copied",
  },
];

const writeText = vi.fn();

function Harness({
  onCopied,
  initial = "cli",
  wrap,
}: {
  onCopied?: (id: string) => void;
  initial?: string;
  wrap?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SnippetBlock
      variants={VARIANTS}
      value={value}
      onChange={setValue}
      highlight={[TOKEN]}
      copyLabel="Copy"
      copiedLabel="Copied"
      onCopied={onCopied}
      aria-label="Add it to your tool"
      wrap={wrap}
    />
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SnippetBlock", () => {
  it("renders one tab per variant and only the selected variant's panel", () => {
    render(<Harness />);
    const tablist = screen.getByRole("tablist", { name: "Add it to your tool" });
    expect(within(tablist).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Claude Code",
      "Cursor",
      "Other tools",
    ]);
    expect(screen.getByRole("tab", { name: "Claude Code" })).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent("Run this in your terminal.");
    expect(panel.querySelector("pre")?.textContent).toBe(COMMAND);
    expect(screen.getByRole("tab", { name: "Claude Code" })).toHaveAttribute("aria-controls", panel.id);
  });

  it("switches variant on tab click and arrow keys", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Cursor" }));
    expect(screen.getByRole("tabpanel").querySelector("pre")?.textContent).toBe(JSON_CONFIG);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Other tools" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Use this address and header.");
  });

  it("highlights the token but copies the plain text", async () => {
    const onCopied = vi.fn();
    render(<Harness onCopied={onCopied} />);
    const pre = screen.getByRole("tabpanel").querySelector("pre") as HTMLElement;
    const marks = pre.querySelectorAll("[data-highlight]");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe(TOKEN);
    // The highlight adds no characters to what is shown.
    expect(pre.textContent).toBe(COMMAND);

    fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Copy" }));
    await flush();

    expect(writeText).toHaveBeenCalledWith(COMMAND);
    expect(onCopied).toHaveBeenCalledWith("cli");
    expect(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("announces the variant's own copied message", async () => {
    render(<Harness initial="json" />);
    const live = document.querySelector('[data-slot="snippet-live"]') as HTMLElement;
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("");
    fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Copy" }));
    await flush();
    expect(writeText).toHaveBeenCalledWith(JSON_CONFIG);
    expect(live).toHaveTextContent("Configuration copied");
  });

  it("does not report a copy the clipboard refused", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    const onCopied = vi.fn();
    render(<Harness onCopied={onCopied} />);
    fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Copy" }));
    await flush();
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("fields mode renders labelled copy chips and reports which variant was copied", async () => {
    const onCopied = vi.fn();
    render(<Harness onCopied={onCopied} initial="fields" />);
    const panel = screen.getByRole("tabpanel");
    expect(panel.querySelector("pre")).toBeNull();
    expect(within(panel).getByText("Server URL")).toBeInTheDocument();
    expect(within(panel).getByText("Header")).toBeInTheDocument();
    const header = within(panel).getByText(`Authorization: Bearer ${TOKEN}`);
    expect(header).toBeInTheDocument();

    const copyButtons = within(panel).getAllByRole("button", { name: "Copy" });
    expect(copyButtons).toHaveLength(2);
    fireEvent.click(copyButtons[1]);
    await flush();

    expect(writeText).toHaveBeenCalledWith(`Authorization: Bearer ${TOKEN}`);
    expect(onCopied).toHaveBeenCalledWith("fields");
  });

  it("wraps by default; wrap={false} keeps line breaks in a focusable scroller", () => {
    const { unmount } = render(<Harness />);
    expect(screen.getByRole("tabpanel").querySelector("pre")).toHaveClass("whitespace-pre-wrap");
    expect(screen.queryByRole("region")).toBeNull();
    unmount();

    render(<Harness wrap={false} />);
    const pre = screen.getByRole("tabpanel").querySelector("pre") as HTMLElement;
    expect(pre).toHaveClass("whitespace-pre");
    expect(pre).not.toHaveClass("whitespace-pre-wrap");
    const region = screen.getByRole("region", { name: "Claude Code" });
    expect(region).toHaveAttribute("tabindex", "0");
  });
});
