"use client";

import { useEffect } from "react";

// Generates a stable per-browser visitor id and pings /api/visit once per load.
// The server dedupes to one visit per browser per day.
export default function VisitTracker() {
  useEffect(() => {
    let id = localStorage.getItem("lc_visitor");
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem("lc_visitor", id);
    }
    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: id }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return null;
}
