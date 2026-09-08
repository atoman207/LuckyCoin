import { NextResponse } from "next/server";
import { getStripeCurrency, isStripeConfigured, minChargeAmount, isZeroDecimal } from "@/lib/stripe";
import { getUsdRate } from "@/lib/fx";
import { getLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tells /buy which currency the card will be charged in and at what rate, so
// the page can show "¥300" next to a $2 pack before the buyer commits.
//
// Read-only. The amount actually charged is always recomputed server-side
// in /api/purchase/stripe. JPY uses the ¥150 / $1 book rate.
export async function GET() {
  const locale = await getLocale();
  const currency = getStripeCurrency(locale);

  try {
    const rate = await getUsdRate(currency);
    return NextResponse.json({
      available: isStripeConfigured(),
      currency: currency.toUpperCase(),
      rate,
      zeroDecimal: isZeroDecimal(currency),
      minCharge: minChargeAmount(currency),
    });
  } catch {
    return NextResponse.json({ available: false, currency: currency.toUpperCase(), rate: null });
  }
}
