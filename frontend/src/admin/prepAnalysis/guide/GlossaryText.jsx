import { glossaryParts } from "./glossary";
import HoverCard from "./HoverCard";

/**
 * Text with its glossary words (Prep Score, accepted, streak, Middle student…) underlined with a
 * dotted line; hovering or tapping one shows its one-line definition.
 */
export default function GlossaryText({ text }) {
  const parts = glossaryParts(text);
  if (parts.length === 1 && !parts[0].entry) return text;
  return parts.map((part, index) => (part.entry
    ? <HoverCard key={index} title={part.entry.term} body={part.entry.text} className="underline decoration-dotted decoration-[1.5px] underline-offset-[3px] decoration-slate-400/80 dark:decoration-slate-500">{part.text}</HoverCard>
    : <span key={index}>{part.text}</span>));
}
