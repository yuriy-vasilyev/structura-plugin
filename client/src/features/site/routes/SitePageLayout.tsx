/**
 * Shared layout shell for every `/site/*` tab.
 *
 * Spec: `specs/seo-intelligence-plan.md` §4.
 *
 * Hosts the page title, the sub-nav tab strip, and a content slot. Each
 * tab page wraps its content with this — keeps the tab strip + header
 * consistent across the five surfaces without nested routing
 * (`App.tsx` doesn't use Outlet for top-level routes).
 */

import { type ReactNode } from "react";
import { __ } from "@wordpress/i18n";

import { PageContainer } from "@/components/Layout/PageContainer";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { SiteSubNav } from "../components/SiteSubNav";

interface Props {
  children: ReactNode;
}

export const SitePageLayout = ({ children }: Props) => (
  <PageContainer variant="narrow" className="space-y-8">
    <header className="space-y-2">
      <PageTitle>{__("Site", "structura")}</PageTitle>
      <PageDescription>
        {__(
          "Everything Structura knows about this site — identity, keyword footprint, competitors, and refresh preferences.",
          "structura",
        )}
      </PageDescription>
    </header>
    <SiteSubNav />
    <section>{children}</section>
  </PageContainer>
);
