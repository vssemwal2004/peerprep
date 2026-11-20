import HoverCard from "./HoverCard";

/**
 * Text with its glossary words underlined with a dotted line; hovering or tapping one shows its
 * one-line definition. glossary: a makeGlossary() result.
 */
export default function GlossaryText({ text, glossary }) {
  const parts = glossary ? glossary.parts(text) : [{ text }];
  if (parts.length === 1 && !parts[0].entry) return text;
  return parts.map((part, index) => (part.entry
    ? <HoverCard key={index} title={part.entry.term} body={part.entry.text} className="underline decoration-dotted decoration-[1.5px] underline-offset-[3px] decoration-slate-400/80 dark:decoration-slate-500">{part.text}</HoverCard>
    : <span key={index}>{part.text}</span>));
}
