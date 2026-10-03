/**
 * Prompts a customer pastes into an AI site builder to add the blog receiver
 * for Article delivery. The docs site and the portal setup flow both render
 * from here so the two never drift.
 *
 * Spec: specs/article-delivery-connect-flow.md §6.6.
 */
import type { SupportedLocale } from "@structura/i18n-contracts";
import { BUILDER_PLATFORMS, type BuilderPlatform } from "@structura/types";

export { BUILDER_PLATFORMS, type BuilderPlatform };

/** Column the prompts are hard-wrapped at, so a 672 px dialog needs no sideways scroll. */
export const BUILDER_PROMPT_COLUMNS = 72;

/** Environment variable the prompts tell the receiver to read the signing secret from. */
export const SIGNING_SECRET_ENV_VAR = "STRUCTURA_SIGNING_SECRET";

/** Public receiver contract the prompts point the builder at. */
export const ARTICLE_DELIVERY_CONTRACT_URL =
  "https://docs.structurawp.com/en/reference/article-delivery";

/** Where each builder runs the receiver; Lovable and Bolt both use Supabase. */
type ReceiverKind = "supabase" | "nextjs" | "replit";

const RECEIVER_KIND: Record<Exclude<BuilderPlatform, "custom">, ReceiverKind> = {
  lovable: "supabase",
  bolt: "supabase",
  v0: "nextjs",
  replit: "replit",
};

interface PromptCopy {
  opening: string;
  connect: string;
  receiver: Record<ReceiverKind, string>;
  verification: string;
  storage: string;
  ending: string;
}

const S = SIGNING_SECRET_ENV_VAR;
const CONTRACT = ARTICLE_DELIVERY_CONTRACT_URL;

const COPY: Record<SupportedLocale, PromptCopy> = {
  en: {
    opening:
      "Add a blog to my existing site without replacing its design. Use my current fonts, colors and navigation. Add /blog and /blog/[slug], with real 404s for missing posts, crawlable article pages, metadata, canonical URLs and sitemap entries.",
    connect: `Connect Structura Article delivery. Follow the delivery contract at ${CONTRACT}`,
    receiver: {
      supabase: `Create a Supabase Edge Function named structura-articles that accepts public HTTPS POST requests, plus a persistent articles table. Turn off JWT verification for this function (verify_jwt = false); the signature is the authentication. Keep ${S} in the function’s secrets only.`,
      nextjs: `Add a Next.js route handler at app/api/structura/route.ts that accepts public HTTPS POST requests, plus a persistent articles table. Read the raw body with request.text() before parsing it. Keep ${S} in the Vercel environment variables, never in client code.`,
      replit: `Add a POST route at /api/structura to the app’s server (Express or similar) that accepts public HTTPS requests, plus a persistent articles table. Read the raw body before any JSON middleware parses it. Keep ${S} in Replit Secrets.`,
    },
    verification:
      'Verify X-Structura-Signature against the exact raw UTF-8 request body and X-Structura-Timestamp using HMAC-SHA256(secret, timestamp + "." + rawBody). Reject timestamps outside 5 minutes, invalid signatures and unsupported events or schema versions before changing data.',
    storage:
      "Use a database transaction with a unique event_id to deduplicate deliveries and upsert articles by site.id + post.id + post.locale. Reject older revisions. Store article content and available SEO fields. Sanitize HTML and serialize JSON-LD safely when rendering. Respond with 2xx only after durable storage; duplicate valid events should also return 2xx.",
    ending:
      "Test a valid delivery, a bad signature and a replay before you say it’s done. When done, reply with the public URL of the receiver so I can paste it into Structura.",
  },
  de: {
    opening:
      "Ergänze meine bestehende Website um einen Blog in ihrem aktuellen Design. Nutze vorhandene Schriften, Farben und Navigation. Erstelle /blog und /blog/[slug], echte 404-Seiten für fehlende Artikel, crawlbare Artikelseiten, Metadaten, kanonische URLs und Sitemap-Einträge.",
    connect: `Verbinde die Structura-Artikelübertragung. Halte dich an den Übertragungsvertrag unter ${CONTRACT}`,
    receiver: {
      supabase: `Erstelle eine Supabase Edge Function namens structura-articles, die öffentliche HTTPS-POST-Anfragen annimmt, und eine dauerhafte Artikeltabelle. Schalte die JWT-Prüfung für diese Funktion ab (verify_jwt = false); die Signatur ist die Authentifizierung. Speichere ${S} nur in den Secrets der Funktion.`,
      nextjs: `Füge unter app/api/structura/route.ts einen Next.js Route Handler hinzu, der öffentliche HTTPS-POST-Anfragen annimmt, und eine dauerhafte Artikeltabelle. Lies den unveränderten Anfragetext mit request.text(), bevor du ihn parst. Speichere ${S} in den Umgebungsvariablen von Vercel, nie im Client-Code.`,
      replit: `Füge dem Server der App (Express oder ähnlich) eine POST-Route unter /api/structura hinzu, die öffentliche HTTPS-Anfragen annimmt, und eine dauerhafte Artikeltabelle. Lies den unveränderten Anfragetext, bevor eine JSON-Middleware ihn parst. Speichere ${S} in Replit Secrets.`,
    },
    verification:
      'Prüfe X-Structura-Signature anhand des unveränderten UTF-8-Anfragetextes und X-Structura-Timestamp: HMAC-SHA256(secret, timestamp + "." + rawBody). Weise Zeitstempel außerhalb von fünf Minuten, ungültige Signaturen und unbekannte Ereignisse oder Schemaversionen vor jeder Datenänderung ab.',
    storage:
      "Nutze eine Datenbanktransaktion mit eindeutigem event_id zur Deduplizierung. Aktualisiere Artikel über site.id + post.id + post.locale. Weise ältere Revisionen ab. Speichere Inhalt und verfügbare SEO-Felder. Bereinige HTML und serialisiere JSON-LD beim Rendern sicher. Antworte erst nach dauerhafter Speicherung mit 2xx; gültige Duplikate erhalten ebenfalls 2xx.",
    ending:
      "Teste eine gültige Übertragung, eine falsche Signatur und ein Replay, bevor du fertig meldest. Antworte danach mit der öffentlichen URL des Empfängers, damit ich sie in Structura einfügen kann.",
  },
  es: {
    opening:
      "Añade un blog a mi web conservando su diseño, tipografía, colores y navegación. Crea /blog y /blog/[slug], con errores 404 reales para artículos inexistentes, páginas rastreables, metadatos, URL canónicas y entradas del sitemap.",
    connect: `Conecta la entrega de artículos de Structura. Sigue el contrato de entrega en ${CONTRACT}`,
    receiver: {
      supabase: `Crea una Supabase Edge Function llamada structura-articles que acepte solicitudes HTTPS POST públicas, y una tabla persistente de artículos. Desactiva la verificación JWT de esta función (verify_jwt = false); la firma es la autenticación. Guarda ${S} solo en los secretos de la función.`,
      nextjs: `Añade un route handler de Next.js en app/api/structura/route.ts que acepte solicitudes HTTPS POST públicas, y una tabla persistente de artículos. Lee el cuerpo original con request.text() antes de analizarlo. Guarda ${S} en las variables de entorno de Vercel, nunca en el código del cliente.`,
      replit: `Añade una ruta POST en /api/structura al servidor de la app (Express o similar) que acepte solicitudes HTTPS públicas, y una tabla persistente de artículos. Lee el cuerpo original antes de que cualquier middleware JSON lo analice. Guarda ${S} en Replit Secrets.`,
    },
    verification:
      'Verifica X-Structura-Signature con el cuerpo UTF-8 original y X-Structura-Timestamp mediante HMAC-SHA256(secret, timestamp + "." + rawBody). Rechaza marcas de tiempo con más de cinco minutos de diferencia, firmas inválidas y eventos o versiones de esquema desconocidos antes de modificar datos.',
    storage:
      "Usa una transacción con event_id único para deduplicar y actualiza los artículos por site.id + post.id + post.locale. Rechaza revisiones antiguas. Guarda contenido y campos SEO disponibles. Sanea el HTML y serializa JSON-LD de forma segura al renderizar. Responde 2xx solo tras guardar de forma duradera; los duplicados válidos también reciben 2xx.",
    ending:
      "Prueba una entrega válida, una firma incorrecta y un replay antes de darlo por terminado. Al terminar, responde con la URL pública del receptor para que pueda pegarla en Structura.",
  },
  fr: {
    opening:
      "Ajoute un blog à mon site en conservant son design, ses polices, ses couleurs et sa navigation. Crée /blog et /blog/[slug], de vraies erreurs 404 pour les articles absents, des pages explorables, les métadonnées, URL canoniques et entrées du sitemap.",
    connect: `Connecte l’envoi des articles de Structura. Suis le contrat d’envoi sur ${CONTRACT}`,
    receiver: {
      supabase: `Crée une Supabase Edge Function nommée structura-articles qui accepte les requêtes HTTPS POST publiques, ainsi qu’une table d’articles persistante. Désactive la vérification JWT pour cette fonction (verify_jwt = false) ; la signature sert d’authentification. Garde ${S} uniquement dans les secrets de la fonction.`,
      nextjs: `Ajoute un route handler Next.js dans app/api/structura/route.ts qui accepte les requêtes HTTPS POST publiques, ainsi qu’une table d’articles persistante. Lis le corps brut avec request.text() avant de l’analyser. Garde ${S} dans les variables d’environnement Vercel, jamais dans le code client.`,
      replit: `Ajoute une route POST /api/structura au serveur de l’app (Express ou équivalent) qui accepte les requêtes HTTPS publiques, ainsi qu’une table d’articles persistante. Lis le corps brut avant qu’un middleware JSON ne l’analyse. Garde ${S} dans Replit Secrets.`,
    },
    verification:
      'Vérifie X-Structura-Signature avec le corps UTF-8 brut et X-Structura-Timestamp via HMAC-SHA256(secret, timestamp + "." + rawBody). Rejette les horodatages décalés de plus de cinq minutes, les signatures invalides et les événements ou versions inconnus avant de modifier les données.',
    storage:
      "Utilise une transaction avec event_id unique pour dédupliquer et mets les articles à jour par site.id + post.id + post.locale. Refuse les révisions anciennes. Stocke le contenu et les champs SEO disponibles. Assainis le HTML et sérialise JSON-LD de façon sûre au rendu. Réponds 2xx après stockage durable uniquement ; les doublons valides reçoivent aussi 2xx.",
    ending:
      "Teste un envoi valide, une signature invalide et un rejeu avant de dire que c’est terminé. Ensuite, réponds avec l’URL publique du récepteur pour que je puisse la coller dans Structura.",
  },
};

/** Returns the paragraph greedily wrapped at {@link BUILDER_PROMPT_COLUMNS}. */
function wrap(paragraph: string): string {
  const lines: string[] = [];
  let line = "";
  for (const word of paragraph.split(/\s+/)) {
    if (line && Array.from(`${line} ${word}`).length > BUILDER_PROMPT_COLUMNS) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/**
 * Returns the builder prompt for a platform in a locale, hard-wrapped at 72
 * columns, or null for `custom`, which has no builder to paste into.
 */
export function builderPrompt(platform: BuilderPlatform, locale: SupportedLocale): string | null {
  if (platform === "custom") return null;
  const copy = COPY[locale];
  return [
    copy.opening,
    copy.connect,
    copy.receiver[RECEIVER_KIND[platform]],
    copy.verification,
    copy.storage,
    copy.ending,
  ]
    .map(wrap)
    .join("\n\n");
}
