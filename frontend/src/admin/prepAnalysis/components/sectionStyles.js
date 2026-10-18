import { BookOpen, ClipboardCheck, Code2, LayoutGrid, MessagesSquare } from "lucide-react";

export const AREA_ICONS = Object.freeze({ all: LayoutGrid, coding: Code2, learning: BookOpen, interview: MessagesSquare, assessment: ClipboardCheck });

// Every feature uses the app's sky theme; only the icon tells them apart.
const SKY = {
  chip: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  note: "bg-sky-50 text-sky-950 dark:bg-sky-500/10 dark:text-sky-100",
  spark: "text-sky-600 dark:text-sky-400",
  ring: "ring-sky-500",
};

export const SECTION_STYLES = Object.freeze({
  coding: { ...SKY, Icon: Code2 },
  learning: { ...SKY, Icon: BookOpen },
  interview: { ...SKY, Icon: MessagesSquare },
  assessment: { ...SKY, Icon: ClipboardCheck },
});
export const sectionStyle = (key) => SECTION_STYLES[key] || SECTION_STYLES.coding;

/** "Asha Verma" → "AV", for avatars. */
export const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "?";
