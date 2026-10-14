"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

type Props = {
  id?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
};

export default function PasswordInput({
  id,
  value,
  onChange,
  required,
  minLength,
  placeholder,
  autoComplete,
  className = "input",
}: Props) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        className={`${className} pr-11`}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-cream hover:text-body"
        aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        tabIndex={-1}
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 3l18 18M10.5 10.7a2.5 2.5 0 0 0 3.8 3.2M9.4 5.1A10.4 10.4 0 0 1 12 4.5c5.5 0 9.5 4.5 10.5 7-.4 1-1.1 2.2-2.1 3.4M6.6 6.6C4.7 8 3.5 9.9 3 11.5c1 2.5 5 7 9 7 1.4 0 2.7-.4 3.9-1"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M2.5 12C3.8 8.5 7.3 5.5 12 5.5S20.2 8.5 21.5 12C20.2 15.5 16.7 18.5 12 18.5S3.8 15.5 2.5 12Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </button>
    </div>
  );
}
