// Project introduction copy. The first lines are shown in the login-gate
// modal; the full set renders on /intro. The actual text lives in the
// message catalogue (src/lib/i18n/messages) so it follows the chosen
// language — this file only fixes the order.
import type { MessageKey } from "@/lib/i18n";

export const INTRO_PARAGRAPH_KEYS: MessageKey[] = [
  "intro.p1",
  "intro.p2",
  "intro.p3",
  "intro.p4",
  "intro.p5",
  "intro.p6",
];

// The short teaser shown before the "Read More" button (first 3 lines).
export const INTRO_TEASER_KEYS: MessageKey[] = INTRO_PARAGRAPH_KEYS.slice(0, 3);
