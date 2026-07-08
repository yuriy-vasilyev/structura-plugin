/* eslint-disable  @typescript-eslint/no-explicit-any */
import React, {
  cloneElement,
  FC,
  ReactElement,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import { cn, generateRandomId } from "../utils";

/**
 * MUI‑style placement choices (12 total)
 */
export type TooltipPosition =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "left-start"
  | "left-end"
  | "right"
  | "right-start"
  | "right-end";

interface TooltipProps {
  /** Tooltip label */
  title: ReactNode;
  /** Placement */
  position?: TooltipPosition;
  /** Extra classes */
  className?: string;
  /** Trigger element */
  children: ReactElement<any, any>;
}

const OFFSET = 8;

function computePosition(anchor: DOMRect, tip: DOMRect, pos: TooltipPosition) {
  let top = 0;
  let left = 0;

  switch (pos) {
    case "top":
      top = anchor.top - tip.height - OFFSET;
      left = anchor.left + (anchor.width - tip.width) / 2;
      break;
    case "top-start":
      top = anchor.top - tip.height - OFFSET;
      left = anchor.left;
      break;
    case "top-end":
      top = anchor.top - tip.height - OFFSET;
      left = anchor.right - tip.width;
      break;
    case "bottom":
      top = anchor.bottom + OFFSET;
      left = anchor.left + (anchor.width - tip.width) / 2;
      break;
    case "bottom-start":
      top = anchor.bottom + OFFSET;
      left = anchor.left;
      break;
    case "bottom-end":
      top = anchor.bottom + OFFSET;
      left = anchor.right - tip.width;
      break;
    case "left":
      top = anchor.top + (anchor.height - tip.height) / 2;
      left = anchor.left - tip.width - OFFSET;
      break;
    case "left-start":
      top = anchor.top;
      left = anchor.left - tip.width - OFFSET;
      break;
    case "left-end":
      top = anchor.bottom - tip.height;
      left = anchor.left - tip.width - OFFSET;
      break;
    case "right":
      top = anchor.top + (anchor.height - tip.height) / 2;
      left = anchor.right + OFFSET;
      break;
    case "right-start":
      top = anchor.top;
      left = anchor.right + OFFSET;
      break;
    case "right-end":
      top = anchor.bottom - tip.height;
      left = anchor.right + OFFSET;
      break;
    default:
      break;
  }

  return { top, left };
}

/**
 * Portal‑based tooltip – tolerates triggers that **don’t forward refs**.
 */
export const Tooltip: FC<TooltipProps> = ({
  children,
  title,
  position = "bottom",
  className = "",
}) => {
  // May be assigned either by a forwarded ref **or** mouse/focus events
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  // Stable id for aria
  const tooltipId = useRef(generateRandomId()).current;

  const open = () => setVisible(true);
  const close = () => setVisible(false);

  // ────────────────────────────────────────────────────────────
  // Align tooltip whenever it’s visible or on scroll/resize
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !anchorRef.current) return;

    const anchorEl = anchorRef.current;
    const tipEl = tooltipRef.current!;

    const update = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const tipRect = tipEl.getBoundingClientRect();
      const { top, left } = computePosition(
        anchorRect,
        tipRect,
        position as TooltipPosition,
      );
      // getBoundingClientRect returns viewport-relative coords which is
      // exactly what position:fixed needs — no scroll offset required.
      tipEl.style.top = `${top}px`;
      tipEl.style.left = `${left}px`;
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchorEl);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [visible, position]);

  // ────────────────────────────────────────────────────────────
  // Compose props to inject behaviour
  // ────────────────────────────────────────────────────────────
  function wrapHandler<E extends React.SyntheticEvent<any>>(
    name: keyof typeof children.props,
    extra: (e: E) => void,
  ) {
    return (e: E) => {
      (children.props as any)[name]?.(e);
      extra(e);
    };
  }

  const triggerProps = {
    onMouseEnter: wrapHandler("onMouseEnter", (e) => {
      anchorRef.current = e.currentTarget as HTMLElement;
      open();
    }),
    onMouseLeave: wrapHandler("onMouseLeave", close),
    onFocus: wrapHandler("onFocus", (e) => {
      anchorRef.current = e.currentTarget as HTMLElement;
      open();
    }),
    onBlur: wrapHandler("onBlur", close),
    "aria-describedby": tooltipId,
    // Pass the forwarded ref if the child supports it – harmless if not
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      const { ref } = children as any;
      if (typeof ref === "function") ref(node);
      else if (ref && typeof ref === "object") ref.current = node;
    },
  } as const;

  // cloneElement’s typings still don’t include `ref`, so cast to any
  const childWithProps = cloneElement(children, triggerProps as any);

  const portal =
    visible &&
    typeof document !== "undefined" &&
    ReactDOM.createPortal(
      <div
        ref={tooltipRef}
        role="tooltip"
        id={tooltipId}
        className={cn(
          // Design guide 6.1: rounded-lg minimum. Dark surface with glass-edge.
          "pointer-events-none fixed z-50 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs text-white shadow-lg ring-1 ring-white/[0.08]",
          className,
        )}
        style={{ top: 0, left: 0 }}
      >
        {title}
      </div>,
      document.body,
    );

  return (
    <>
      {childWithProps}
      {portal}
    </>
  );
};
