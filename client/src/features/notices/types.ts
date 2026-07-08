/**
 * Wire-shape types mirroring `functions/src/notices/types.ts::NoticeDoc`,
 * minus `schemaVersion`.
 *
 * Duplicated here rather than imported via `@structura/types` because
 * the cloud `NoticeDoc` is a Firestore write-side concern; the
 * wp-admin SPA sees only the shape the cloud's HTTP endpoint
 * returns. Keeping the surface independent means changes to the
 * cloud's storage layout don't ripple into the wp-admin build.
 */

export type NoticeCategory =
  | "billing"
  | "license"
  | "connection"
  | "quota"
  | "byok"
  | "generation"
  | "plugin-health";

export type NoticeSeverity = "warning" | "error";

export type NoticeStatus = "open" | "acknowledged" | "resolved";

export type NoticeCtaHref =
  | { kind: "wp-admin"; route: string }
  | { kind: "portal"; route: string }
  | { kind: "both"; wpAdmin: string; portal: string }
  | { kind: "external"; url: string };

export interface Notice {
  noticeId: string;
  licenseKey: string;
  workspaceId: string;
  activationId?: string;
  domain?: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  subjectId: string;
  status: NoticeStatus;
  firstSeenAt: number;
  lastSeenAt: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  resolvedAt?: number;
  resolvedBy?: "system" | "user";
  titleKey: string;
  bodyKey: string;
  bodyParams?: Record<string, string>;
  cta?: {
    labelKey: string;
    href: NoticeCtaHref;
  };
  occurrences: number;
  traceIds: string[];
  errorCode?: string;
}

export interface NoticesResponse {
  success: boolean;
  notices: Notice[];
  nextCursor: string | null;
}
