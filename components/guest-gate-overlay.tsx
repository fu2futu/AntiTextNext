"use client";

import Link from "next/link";
import { Lock, UserPlus } from "lucide-react";

/**
 * GuestGateOverlay
 * --------------------------------------------------
 * Shows a gradient + blur overlay with a call‑to‑action button
 * that leads non‑registered users to the signup page.
 *
 * Place this as a sibling **after** the visible items inside
 * a `position: relative` container so it fades over the bottom.
 */
export function GuestGateOverlay({
  message = "もっと見るには会員登録が必要です",
  buttonLabel = "登録してもっと見る",
  href = "/auth/signup",
}: {
  message?: string;
  buttonLabel?: string;
  href?: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-center justify-end rounded-b-2xl">
      {/* Gradient veil — taller on mobile for better coverage */}
      <div className="absolute inset-x-0 bottom-0 h-56 sm:h-48 bg-gradient-to-t from-white via-white/95 to-transparent backdrop-blur-[2px]" />

      {/* CTA card */}
      <div className="pointer-events-auto relative z-10 mb-6 flex flex-col items-center gap-3 rounded-2xl bg-white/90 px-6 py-5 shadow-xl ring-1 ring-gray-200 backdrop-blur-md">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <p className="text-center text-sm font-bold text-gray-700">{message}</p>
        <Link
          href={href}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95"
        >
          <UserPlus className="h-4 w-4" />
          {buttonLabel}
        </Link>
      </div>
    </div>
  );
}

/**
 * GuestSearchGate
 * --------------------------------------------------
 * Replaces the search‑bar Link for non‑authenticated users.
 * Clicking navigates to the signup page instead of the search page.
 */
export function GuestSearchGate({
  placeholder,
  href = "/auth/signup",
}: {
  placeholder: string;
  href?: string;
}) {
  return (
    <Link href={href} className="block">
      <div className="relative group">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Lock className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
        </div>
        <div className="w-full py-3 pl-12 pr-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-primary/50 hover:bg-white transition-all cursor-pointer text-sm text-gray-400 font-medium select-none">
          {placeholder}
        </div>
      </div>
    </Link>
  );
}

/**
 * GuestSubjectsGate
 * --------------------------------------------------
 * A disabled‑looking version of the "分野から探す" button
 * that navigates to signup instead.
 */
export function GuestSubjectsGate({ href = "/auth/signup" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99] group relative"
    >
      <Lock className="h-5 w-5 flex-shrink-0 text-gray-400 group-hover:text-primary transition-colors" />
      <span className="flex-1 text-sm font-bold text-gray-400 group-hover:text-gray-600 transition-colors">
        分野から探す
      </span>
      <span className="text-xs font-medium text-gray-400 group-hover:text-primary transition-colors">
        登録して利用する ›
      </span>
    </Link>
  );
}
