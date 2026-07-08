import { ContentBlock } from "./types";
import { __ } from "@wordpress/i18n";

export const CONTENT_BLOCKS: ContentBlock[] = [
  {
    name: "core/paragraph",
    label: __("Paragraph", "structura"),
    isPro: false,
    isRequired: true,
    description: __(
      "Enable generation of paragraph blocks, the fundamental building blocks for any content piece, allowing for rich text formatting and seamless integration of AI-generated content.",
      "structura"
    ),
  },
  {
    name: "core/heading",
    label: __("Heading", "structura"),
    isPro: false,
    isRequired: false,
    description: __(
      "Allow generation of heading blocks, essential for structuring your content with clear sections and improving readability, while also enhancing SEO by organizing content hierarchy effectively.",
      "structura"
    ),
  },
  {
    name: "core/list",
    label: __("List", "structura"),
    isPro: true,
    description: __(
      "Enable generation of list blocks, perfect for creating organized bullet points or numbered lists that enhance the clarity and scannability of your content, making it easier for readers to digest key information.",
      "structura"
    ),
  },
  {
    name: "core/quote",
    label: __("Quote", "structura"),
    isPro: true,
    description: __(
      "Enable generation of quote blocks, ideal for highlighting key insights or statements within your content.",
      "structura"
    ),
  },
  {
    name: "core/table",
    label: __("Table", "structura"),
    isPro: true,
    description: __(
      "Allow generation of table blocks, perfect for organizing data, comparisons, or structured information in a clear format.",
      "structura"
    ),
  },
  {
    name: "core/code",
    label: __("Code", "structura"),
    isPro: true,
    // Most blogs (recipes, travel, local business…) have no natural code
    // content — a default-on code block invites the AI to force-fit one.
    defaultOff: true,
    description: __(
      "Enable generation of code blocks for technical posts, tutorials, and developer content. Code is rendered with monospace formatting and preserved whitespace.",
      "structura"
    ),
  },
  {
    name: "core/pullquote",
    label: __("Pull Quote", "structura"),
    isPro: true,
    // Citation support was intentionally removed — see
    // plugin/includes/Generator/Block_Serializer.php render_pullquote.
    description: __(
      "Enable generation of pull quote blocks that visually highlight a single high-impact statement from the content.",
      "structura"
    ),
  },
  {
    name: "core/details",
    label: __("Details (Accordion)", "structura"),
    isPro: true,
    description: __(
      "Enable generation of expandable accordion blocks, ideal for supplementary details, FAQs within sections, or collapsible technical explanations.",
      "structura"
    ),
  },
];
