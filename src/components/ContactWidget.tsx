"use client";

import Link from "next/link";

// Floating message-icon button pinned to the bottom-left corner. Clicking it
// takes the user to the "Contact Us" page, where the form is delivered to the
// site owner's inbox via SMTP (see /api/contact).
export default function ContactWidget() {
  return (
    <Link
      href="/contact"
      aria-label="Contact us"
      title="Contact us"
      className="fixed bottom-4 left-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-amber-400 text-slate-900 shadow-lg transition hover:scale-105 hover:bg-amber-300"
    >
      {/* message / chat bubble icon */}
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
