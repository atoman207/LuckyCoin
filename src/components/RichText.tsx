"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey, Vars } from "@/lib/i18n";

// Renders a translated string that contains light inline markup (<b>, <strong>,
// <em>). The HTML comes only from our own message catalogue — never from user
// input — so injecting it is safe, and it keeps translators free to move the
// emphasis to wherever the sentence needs it in their language.
export default function RichText({
  k,
  vars,
  as: Tag = "span",
  className,
}: {
  k: MessageKey;
  vars?: Vars;
  as?: "span" | "p" | "div" | "li" | "h2" | "h3";
  className?: string;
}) {
  const { t } = useI18n();
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: t(k, vars) }} />;
}
