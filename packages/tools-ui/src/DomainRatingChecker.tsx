"use client";

import type { FC, ReactElement, ReactNode } from "react";
import { ArrowRight, Info } from "lucide-react";
import { Button } from "@structura/ui/button";
import { formatNumber, formatPercent, formatRange, fill } from "./lib/format";
import type { LearnTarget } from "./lib/learn";
import {
  DOFOLLOW_BANDS,
  LINK_PROFILE_SIZES,
  RANK_STAGES,
  SPAM_BANDS,
  bandRanges,
  dofollowVerdict,
  rankVerdict,
  referringVerdict,
  spamVerdict,
  wholePercent,
  type Band,
  type DofollowBand,
  type LinkProfileSize,
  type NoLinks,
  type NotMeasured,
  type RankStage,
  type SpamBand,
  type Verdict,
  type VerdictIntent,
} from "./lib/score";
import { isRefusal, type AuthorityResult } from "./lib/types";
import { useToolRun, type ToolRefusal, type ToolRequestInput, type ToolRunEvent, type ToolRunner } from "./useToolRun";
import {
  BigScore,
  Disclosure,
  EmptyPane,
  ErrorPane,
  LearnLink,
  MetricTile,
  ReportBody,
  ReportFooter,
  ReportFrame,
  ReportSkeleton,
  ResultArea,
  SourceBar,
  ToolCard,
  ToolForm,
  VerdictChip,
  type ToolFormDict,
  type ToolSharedDict,
} from "./ToolUi";

/** A verdict's chip label and its one-line meaning. */
interface VerdictCopy {
  label: string;
  line: string;
}

/**
 * The domain report's verdict copy (www: `domain-rating-checker.json#result.report.verdicts`,
 * specs/blogseo-gap-analysis.md §4.11).
 */
export interface DomainRatingVerdictsDict {
  /** Stage label per rank band, and the line under the rank. */
  rank: Record<RankStage, string> & { line: string };
  /** Size label per referring (root) domain band; `line` under a measured count, `noneLine` under 0. */
  referring: Record<LinkProfileSize, string> & { line: string; noneLine: string };
  /** Line under the referring root domains. */
  rootDomains: { line: string };
  /** Line under the backlinks, which get no chip. */
  backlinks: { line: string };
  /** Chip and line per dofollow share band. */
  dofollow: Record<DofollowBand, VerdictCopy>;
  /** Chip and line per spam score band. */
  spam: Record<SpamBand, VerdictCopy>;
  /** Dofollow share and spam score of a domain with no backlinks. */
  noLinks: VerdictCopy;
  /** Line under a figure the index did not report. */
  notMeasuredLine: string;
  /** The "How these bands work" disclosure; the spam row reuses `links.spamScore`. */
  bands: {
    title: string;
    rows: { rank: string; referring: string; dofollow: string };
    /** When "No links yet" applies, in the place of a range. */
    noBacklinks: string;
    intro: string;
    neutralNote: string;
  };
}

/**
 * The Domain Rating checker's copy (www: `domain-rating-checker.json`),
 * limited to the keys the widget reads. Each surface keeps its own
 * dictionary (§4.9.4).
 */
export interface DomainRatingCheckerDict {
  /** Card label and form copy. */
  tool: ToolFormDict;
  /** Everything under the form. */
  result: {
    /** Empty state before the first check. */
    empty: { title: string; hint: string; checks: string[] };
    /** The one honest line above the loading skeleton. */
    loading: string;
    /** What was measured, after the vendor in the source bar. */
    source: string;
    /** The report. */
    report: {
      /** Heading of the score column, naming the vendor's rank. */
      scoreLabel: string;
      /** Scale after the score, e.g. "/ 100". */
      outOf: string;
      /** Line under the score naming the scale. */
      scoreScale: string;
      /** Accessible name of the score; `{{score}}`. */
      scoreAria: string;
      /** That this is not Ahrefs DR or Moz DA. */
      notDr: string;
      /** Shown in place of a score when the index has none. */
      noScore: string;
      /** Report headline; `{{domain}}`. */
      headline: string;
      /** Heading of the link figures. */
      linksTitle: string;
      /** Label per link figure; `dofollowNote` names the share's denominator. */
      links: {
        referringDomains: string;
        backlinks: string;
        referringMainDomains: string;
        dofollowBacklinkShare: string;
        dofollowNote: string;
        spamScore: string;
      };
      /** Label of the link to the keyword generator. */
      exploreCta: string;
      /** Chips, lines and the bands disclosure. */
      verdicts: DomainRatingVerdictsDict;
    };
  };
  /** The report footer's pitch next to the actions. */
  resultCta: { title: string; body: string };
}

type Dict = DomainRatingCheckerDict;
type Shared = ToolSharedDict;

interface DomainRatingCheckerProps {
  /** Locale for numbers and dates. */
  locale: string;
  /** The tool's copy. */
  dict: Dict;
  /** Copy every tool shares. */
  shared: Shared;
  /** Where the surface's Learn links go and which pages are published (§4.11). */
  learn: LearnTarget;
  /** Runs the check the surface's way. */
  runner: ToolRunner;
  /** The surface's analytics for each step of a run. */
  onEvent?: (event: ToolRunEvent) => void;
  /**
   * Shown in place of the error pane when a run is refused: the shared pool
   * is spent (`capacity`) or, on www, the visitor's own daily checks are
   * (`visitor_limit`, §4.10).
   */
  renderCapacity: (request: ToolRequestInput, refusal: ToolRefusal) => ReactNode;
  /**
   * The surface's link to its keyword generator, wrapped around the
   * "Explore keywords" label and icon; the button styling stays here.
   */
  renderExploreLink: (content: ReactNode) => ReactElement;
  /** The report footer's call to action, after "Explore keywords". */
  cta: ReactNode;
  /** Domain the field starts with, e.g. from a portal link. */
  initialInput?: string;
  /** Check `initialInput` once on mount, when it is a valid domain. */
  autoRun?: boolean;
}

/**
 * Free Domain Rating (DR) Checker widget: one domain in, DataForSEO's
 * DR-comparable domain rank and the global backlink profile out
 * (specs/blogseo-gap-analysis.md §4.3 "authority", report §4.8.2). Link
 * figures are global, so there is no country to pick; the organic footprint
 * that needed one was removed on 2026-10-01. Tool id on the wire stays
 * `authority`. The surface supplies the runner, the capacity state and the
 * footer links.
 */
export const DomainRatingChecker: FC<DomainRatingCheckerProps> = ({
  locale,
  dict,
  shared,
  learn,
  runner,
  onEvent,
  renderCapacity,
  renderExploreLink,
  cta,
  initialInput,
  autoRun = false,
}) => {
  const { state, run, retry, reset } = useToolRun(
    "authority",
    runner,
    onEvent,
    autoRun && initialInput ? { input: initialInput } : undefined,
  );
  const busy = state.phase === "loading";

  return (
    <ToolCard label={dict.tool.cardLabel} byline={dict.tool.cardByline}>
      <ToolForm
        tool="authority"
        dict={dict.tool}
        shared={shared}
        busy={busy}
        defaultInput={initialInput}
        onSubmit={(input) => void run(input)}
      />
      <ResultArea>
        {state.phase === "idle" && <EmptyPane {...dict.result.empty} />}
        {state.phase === "loading" && <ReportSkeleton line={dict.result.loading} ariaLabel={shared.loadingAria} />}
        {state.phase === "error" &&
          (isRefusal(state.error) ? (
            renderCapacity(state.request, {
              reason: state.error,
              ...(state.retryAt !== undefined ? { retryAt: state.retryAt } : {}),
            })
          ) : (
            <ErrorPane
              error={state.error}
              shared={shared}
              invalidHint={dict.tool.invalidHint}
              retryAt={state.retryAt}
              onRetry={retry}
            />
          ))}
        {state.phase === "done" && (
          <DomainReport
            result={state.result}
            cached={state.cached}
            locale={locale}
            dict={dict}
            shared={shared}
            learn={learn}
            renderExploreLink={renderExploreLink}
            cta={cta}
            onReset={reset}
          />
        )}
      </ResultArea>
    </ToolCard>
  );
};

const DomainReport: FC<{
  result: AuthorityResult;
  cached: boolean;
  locale: string;
  dict: Dict;
  shared: Shared;
  learn: LearnTarget;
  renderExploreLink: (content: ReactNode) => ReactElement;
  cta: ReactNode;
  onReset: () => void;
}> = ({ result, cached, locale, dict, shared, learn, renderExploreLink, cta, onReset }) => {
  const r = dict.result.report;
  const v = r.verdicts;
  const a = result.authority;
  const score = a.score;
  const n = (value: number) => formatNumber(value, locale);
  const shown = (value: number | undefined) => (value === undefined ? shared.noValue : n(value));

  // Bands from score.ts, copy from the surface's dictionary (§4.11). A
  // figure the index did not report is "Not measured", never 0.
  const rank = rankVerdict(score);
  const referring = referringVerdict(a.referringDomains);
  const rootDomains = referringVerdict(a.referringMainDomains);
  const dofollow = dofollowVerdict(a.dofollowBacklinkShare, a.backlinks);
  const spam = spamVerdict(a.spamScore, a.backlinks);

  const notMeasured: VerdictCopy = { label: shared.notMeasured, line: v.notMeasuredLine };
  const sizeLabel: Record<LinkProfileSize | NotMeasured, string> = { ...v.referring, notMeasured: shared.notMeasured };
  const sizeLine = (size: Verdict<LinkProfileSize | NotMeasured>, line: string) =>
    size.band === "notMeasured" ? v.notMeasuredLine : size.band === "none" ? v.referring.noneLine : line;
  const dofollowCopy: Record<DofollowBand | NoLinks | NotMeasured, VerdictCopy> = {
    ...v.dofollow,
    noLinks: v.noLinks,
    notMeasured,
  };
  const spamCopy: Record<SpamBand | NoLinks | NotMeasured, VerdictCopy> = { ...v.spam, noLinks: v.noLinks, notMeasured };

  // Root domains follow referring domains, and the spam score the dofollow
  // share: the second of a pair shows only its chip when its line would
  // repeat the first's, as it does for a new site (QA 2026-10-02).
  const referringLine = sizeLine(referring, v.referring.line);
  const rootDomainsLine = sizeLine(rootDomains, v.rootDomains.line);
  const dofollowLine = dofollowCopy[dofollow.band].line;
  const spamLine = spamCopy[spam.band].line;

  // The zero rule: with no backlinks the share and the spam score are a dash.
  const share = a.backlinks !== 0 ? a.dofollowBacklinkShare : undefined;
  const spamScore = a.backlinks !== 0 ? a.spamScore : undefined;

  return (
    <ReportFrame testId="authority-result">
      <SourceBar
        shared={shared}
        locale={locale}
        detail={dict.result.source}
        fetchedAt={result.fetchedAt}
        cached={cached}
        onReset={onReset}
      />
      <ReportBody
        wideOverview
        overview={
          <div>
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">{r.scoreLabel}</p>
            {score !== undefined ? (
              <>
                {/* Neutral on purpose: a link rank has no universal good or bad, so its stage chip is grey too. */}
                <BigScore
                  score={score}
                  outOf={r.outOf}
                  ariaLabel={fill(r.scoreAria, { score: Math.round(score) })}
                  toneClass="text-neutral-900 dark:text-white"
                />
                <p className="mt-1 text-xs font-semibold text-neutral-700 dark:text-neutral-200">{r.scoreScale}</p>
              </>
            ) : (
              <p
                aria-hidden="true"
                className="mt-3 font-display text-6xl font-extrabold leading-none text-neutral-300 dark:text-neutral-600"
              >
                {shared.noValue}
              </p>
            )}
            <div className="mt-3 flex">
              <VerdictChip
                intent={rank.intent}
                label={rank.band === "notMeasured" ? shared.notMeasured : v.rank[rank.band]}
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-pretty text-neutral-600 dark:text-neutral-300">
              {score !== undefined ? v.rank.line : r.noScore}
            </p>
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-neutral-700 dark:text-neutral-200">
              <Info className="mt-0.5 size-3.5 shrink-0 text-neutral-500 dark:text-neutral-400" strokeWidth={2.5} aria-hidden="true" />
              {r.notDr}
            </p>
            {score !== undefined && (
              <LearnLink target={learn} copy={shared.learn} slug="domain-authority" className="mt-3" />
            )}
          </div>
        }
      >
        <h3 className="break-words text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          {fill(r.headline, { domain: result.domain })}
        </h3>

        {/* A container: the grid follows the report's width, which the
            portal's sidebar narrows well below the viewport's (§4.11). */}
        <section aria-labelledby="dr-links-title" className="@container mt-5" data-testid="dr-links">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h4 id="dr-links-title" className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-200">
              {r.linksTitle}
            </h4>
            <LearnLink target={learn} copy={shared.learn} slug="backlink-profile" />
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-5 gap-y-5 @sm:grid-cols-2 @xl:grid-cols-3">
            <MetricTile
              metric="referringDomains"
              label={r.links.referringDomains}
              value={shown(a.referringDomains)}
              missing={a.referringDomains === undefined}
              verdict={{ intent: referring.intent, label: sizeLabel[referring.band] }}
              line={referringLine}
              learn={
                referring.band !== "notMeasured" && (
                  <LearnLink target={learn} copy={shared.learn} slug="referring-domains" className="mt-2" />
                )
              }
            />
            <MetricTile
              metric="backlinks"
              label={r.links.backlinks}
              value={shown(a.backlinks)}
              missing={a.backlinks === undefined}
              verdict={a.backlinks === undefined ? { intent: "unknown", label: shared.notMeasured } : undefined}
              line={a.backlinks === undefined ? v.notMeasuredLine : a.backlinks > 0 ? v.backlinks.line : undefined}
            />
            <MetricTile
              metric="referringMainDomains"
              label={r.links.referringMainDomains}
              value={shown(a.referringMainDomains)}
              missing={a.referringMainDomains === undefined}
              verdict={{ intent: rootDomains.intent, label: sizeLabel[rootDomains.band] }}
              line={rootDomainsLine === referringLine ? undefined : rootDomainsLine}
            />
            <MetricTile
              metric="dofollowBacklinkShare"
              label={r.links.dofollowBacklinkShare}
              note={r.links.dofollowNote}
              value={share === undefined ? shared.noValue : formatPercent(wholePercent(share) / 100, locale)}
              missing={share === undefined}
              verdict={{ intent: dofollow.intent, label: dofollowCopy[dofollow.band].label }}
              line={dofollowLine}
              learn={
                dofollow.action && (
                  <LearnLink
                    target={learn}
                    copy={shared.learn}
                    slug="backlink-profile"
                    label={shared.learn.howToImprove}
                    className="mt-2"
                  />
                )
              }
            />
            <MetricTile
              metric="spamScore"
              label={r.links.spamScore}
              value={
                spamScore === undefined ? (
                  shared.noValue
                ) : (
                  <>
                    {n(spamScore)}
                    <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">{r.outOf}</span>
                  </>
                )
              }
              missing={spamScore === undefined}
              verdict={{ intent: spam.intent, label: spamCopy[spam.band].label }}
              line={spamLine === dofollowLine ? undefined : spamLine}
              learn={
                spam.action && (
                  <LearnLink
                    target={learn}
                    copy={shared.learn}
                    slug="spam-score"
                    label={shared.learn.howToImprove}
                    className="mt-2"
                  />
                )
              }
            />
          </dl>
          <Disclosure title={v.bands.title} testId="dr-bands" className="mt-6">
            <DomainBands dict={dict} locale={locale} />
          </Disclosure>
        </section>
      </ReportBody>
      <ReportFooter title={dict.resultCta.title} body={dict.resultCta.body}>
        {/* No seed: a keyword guessed from a domain name is noise (§4.8.2). */}
        <Button asChild variant="secondary" size="md" className="justify-center gap-2">
          {renderExploreLink(
            <>
              {r.exploreCta}
              <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
            </>,
          )}
        </Button>
        {cta}
      </ReportFooter>
    </ReportFrame>
  );
};

/** One band in the legend: its chip and its range, formatted for the page. */
interface LegendBand {
  key: string;
  intent: VerdictIntent;
  label: string;
  range: string;
}

/** A scale's bands with their ranges, from the same tables the verdicts read. */
function legendBands<K extends string>(
  bands: readonly Band<K>[],
  top: number | undefined,
  label: (key: K) => string,
  locale: string,
  percent = false,
): LegendBand[] {
  return bandRanges(bands, top).map((range, i) => ({
    key: range.key,
    intent: bands[i]!.intent,
    label: label(range.key),
    range: formatRange(range, locale, percent),
  }));
}

/** "How these bands work": every chip the report's figures can show, with its range. */
const DomainBands: FC<{ dict: Dict; locale: string }> = ({ dict, locale }) => {
  const r = dict.result.report;
  const v = r.verdicts;
  // The zero rule's chip, on both figures it applies to.
  const noLinks: LegendBand = { key: "noLinks", intent: "neutral", label: v.noLinks.label, range: v.bands.noBacklinks };
  const rows: Array<{ name: string; bands: LegendBand[] }> = [
    { name: v.bands.rows.rank, bands: legendBands(RANK_STAGES, 100, (key) => v.rank[key], locale) },
    {
      name: v.bands.rows.referring,
      bands: legendBands(LINK_PROFILE_SIZES, undefined, (key) => v.referring[key], locale),
    },
    {
      name: v.bands.rows.dofollow,
      // Best first, as the chips are read.
      bands: [...legendBands(DOFOLLOW_BANDS, 100, (key) => v.dofollow[key].label, locale, true).reverse(), noLinks],
    },
    {
      name: r.links.spamScore,
      bands: [...legendBands(SPAM_BANDS, 100, (key) => v.spam[key].label, locale), noLinks],
    },
  ];
  return (
    <>
      <dl className="grid grid-cols-1 gap-y-3 @sm:grid-cols-[9.5rem_minmax(0,1fr)] @sm:gap-x-4">
        {rows.map((row) => (
          <div key={row.name} className="contents">
            <dt className="text-xs font-semibold text-neutral-800 @sm:pt-0.5 dark:text-neutral-100">{row.name}</dt>
            <dd className="-mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5 @sm:mt-0">
              {row.bands.map((band) => (
                <span key={band.key} className="inline-flex max-w-full items-center gap-1.5">
                  <VerdictChip intent={band.intent} label={band.label} size="xs" />
                  <span className="whitespace-nowrap text-[11px] tabular-nums text-neutral-600 dark:text-neutral-300">
                    {band.range}
                  </span>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
        {v.bands.intro} {v.bands.neutralNote}
      </p>
    </>
  );
};
