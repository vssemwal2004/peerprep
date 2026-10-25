// Inter (SIL Open Font License 1.1, see fonts/OFL.txt) for the report PDF. Vite turns each import into an
// asset URL; the files are only fetched when a PDF is generated.
import regular from "./fonts/Inter-Regular.ttf";
import medium from "./fonts/Inter-Medium.ttf";
import semibold from "./fonts/Inter-SemiBold.ttf";
import bold from "./fonts/Inter-Bold.ttf";

export const INTER_SOURCES = Object.freeze({ regular, medium, semibold, bold });
