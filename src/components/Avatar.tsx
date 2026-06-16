"use client";

import { useEffect, useState } from "react";

// Round avatar. Shows the image, or falls back to the first letter of the
// nickname on a colored disc — both when there is no image AND when the image
// fails to load (e.g. a provider rate-limits), so a broken URL never shows ugly
// clipped alt text.
export default function Avatar({
  src,
  name,
  size = 40,
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Reset the error state if the image source changes.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initial = name?.trim()?.charAt(0)?.toUpperCase() || "?";

  if (src && !failed) {
    // Plain <img> (not next/image) so external avatar hosts work without config.
    // alt="" so nothing is shown while loading or on failure (we render the
    // initial disc on error instead).
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`rounded-full bg-white/5 object-cover ring-2 ring-white/15 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`grid place-items-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 font-bold text-slate-900 ring-2 ring-white/15 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
