/**
 * Plugin translation catalogs: no German in the Spanish or French UI.
 *
 * First seen 2026-09-24: the dashboard queue showed "Scheduled" as
 * "Geplant" to es_ES and fr_FR admins. Auditing the catalogs found ~240
 * Spanish and ~300 French strings that were German, or half-German after
 * a broken word-substitution pass ("Save Changes" → "Ände laungen
 * speichern") — the es/fr catalogs had been seeded from de_DE.
 *
 * This reads the .po sources the runtime JSON and .mo files are built from
 * (scripts/po-to-wp-json.mjs, msgfmt) and fails when an es/fr string:
 * 1. is identical to the German translation of the same msgid (while the
 *    German differs from the English source), or
 * 2. carries German-only letters (ä ö ß) or common German UI words.
 * Obsolete `#~` entries are ignored — gettext never loads them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LANG_DIR = join(__dirname, "../../../plugin/languages");

interface Entry {
  key: string; // msgctxt + \u0004 + msgid, as gettext keys it
  msgid: string;
  msgstr: string[];
}

function unescapePo(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => ({ n: "\n", t: "\t" })[c] ?? c);
}

/** Minimal .po reader: live entries only, continuation lines joined. */
function readPo(locale: string): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  const blocks = readFileSync(join(LANG_DIR, `structura-${locale}.po`), "utf8").split(/\n\s*\n/);
  for (const block of blocks) {
    const fields: Record<string, string> = {};
    let current: string | null = null;
    for (const line of block.split("\n")) {
      const head = line.match(/^(msgctxt|msgid|msgid_plural|msgstr(?:\[\d+\])?) "(.*)"$/);
      if (head) {
        current = head[1];
        fields[current] = unescapePo(head[2]);
      } else if (current && /^".*"$/.test(line)) {
        fields[current] += unescapePo(line.slice(1, -1));
      } else if (!line.startsWith("#")) {
        current = null;
      }
    }
    if (!fields.msgid) continue; // header or obsolete (#~) block
    const msgstr = Object.keys(fields)
      .filter((k) => k.startsWith("msgstr"))
      .map((k) => fields[k]);
    const key = (fields.msgctxt ? `${fields.msgctxt}\u0004` : "") + fields.msgid;
    entries.set(key, { key, msgid: fields.msgid, msgstr });
  }
  return entries;
}

/**
 * Strings that are genuinely the same in German and the target language.
 * Add here only after checking the word is correct in that language.
 */
const SAME_AS_GERMAN: Record<string, readonly string[]> = {
  es_ES: ["%1$d min %2$d s", "%d s", "Cloud"],
  fr_FR: ["%1$d min %2$d s", "%d s", "Cloud", "Slogan", "Liste", "Intelligent", "Taxonomie"],
};

// Letter-aware boundaries: a plain \b treats "é" as a boundary, so French
// "accéder" would match the German article "der".
const GERMAN_MARKERS =
  /[äöÄÖß]|(?<!\p{L})(und|nicht|werden|wird|wurde|der|die|das|mit|für|oder|ist|sind|keine?|zurück|anzeigen|speichern|gespeichert|erfolgreich|fehlgeschlagen|aktualisiert|Einstellungen|bitte|generieren|entfernen|hinzufügen|löschen|bearbeiten|durchsuchen|filtern|trennen|verbinden|überprüfen|geplant|Kampagnen?|Beiträge|Protokolle|Warteschlange|AN|AUS)(?!\p{L})/u;

const german = [readPo("de_DE"), readPo("de_AT")];

describe.each(["es_ES", "fr_FR"])("plugin catalog %s", (locale) => {
  const catalog = readPo(locale);
  const allowed = new Set(SAME_AS_GERMAN[locale]);

  it("has no strings copied from the German catalog", () => {
    const copied: string[] = [];
    for (const entry of catalog.values()) {
      for (const [i, str] of entry.msgstr.entries()) {
        if (!str || str === entry.msgid || allowed.has(str)) continue;
        const isGerman = german.some((de) => {
          const deStr = de.get(entry.key)?.msgstr[i];
          return deStr && deStr !== entry.msgid && deStr === str;
        });
        if (isGerman) copied.push(`${entry.msgid} → ${str}`);
      }
    }
    expect(copied).toEqual([]);
  });

  it("has no German words or letters", () => {
    const leaked = [...catalog.values()].flatMap((e) =>
      e.msgstr.filter((s) => GERMAN_MARKERS.test(s)).map((s) => `${e.msgid} → ${s}`),
    );
    expect(leaked).toEqual([]);
  });
});
