// Round avatar. Shows the uploaded image, or falls back to the first letter
// of the nickname on a colored disc.
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
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || "?";
  if (src) {
    // Plain <img> (not next/image) so runtime-written files under /public work
    // without extra config.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={`${name} avatar`}
        width={size}
        height={size}
        className={`rounded-full object-cover ring-2 ring-white/15 ${className}`}
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
