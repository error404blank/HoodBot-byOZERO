/**
 * GMGN.ai — token safety and smart money analytics
 * Public endpoints (no API key required for basic info)
 */
const BASE_URL = "https://gmgn.ai/defi/quotation/v1";

export interface GmgnTokenSafety {
  address: string;
  symbol: string;
  isHoneypot: boolean;
  isRenounced: boolean;
  isMintable: boolean;
  isPausable: boolean;
  lpBurnPercent: number;
  topHolderPercent: number;
  devHoldPercent: number;
  riskScore: number; // 0 = safe, 100 = very risky
  riskLevel: "low" | "medium" | "high" | "critical";
}

export async function getTokenSafety(
  address: string,
  chain = "base"
): Promise<GmgnTokenSafety | null> {
  try {
    const res = await fetch(`${BASE_URL}/token/security/${chain}/${address}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;

    const d = data as Record<string, unknown>;
    const isHoneypot = Boolean(d.is_honeypot);
    const isMintable = Boolean(d.is_mintable);
    const isPausable = Boolean(d.is_pausable);
    const isRenounced = Boolean(d.renounced);
    const lpBurnPercent = Number(d.lp_burned_percent ?? 0);
    const topHolderPercent = Number(d.top10_holder_rate ?? 0) * 100;
    const devHoldPercent = Number(d.dev_token_burn_amount ?? 0);

    let riskScore = 0;
    if (isHoneypot) riskScore += 60;
    if (isMintable) riskScore += 20;
    if (isPausable) riskScore += 10;
    if (!isRenounced) riskScore += 5;
    if (topHolderPercent > 50) riskScore += 15;
    if (lpBurnPercent < 80) riskScore += 10;

    const riskLevel =
      riskScore >= 60
        ? "critical"
        : riskScore >= 40
        ? "high"
        : riskScore >= 20
        ? "medium"
        : "low";

    return {
      address,
      symbol: String(d.symbol ?? ""),
      isHoneypot,
      isRenounced,
      isMintable,
      isPausable,
      lpBurnPercent,
      topHolderPercent,
      devHoldPercent,
      riskScore: Math.min(100, riskScore),
      riskLevel,
    };
  } catch {
    return null;
  }
}

export function formatSafetyReport(safety: GmgnTokenSafety): string {
  const riskEmoji = {
    low: "[SAFE]",
    medium: "[CAUTION]",
    high: "[RISKY]",
    critical: "[DANGER]",
  }[safety.riskLevel];

  const lines = [
    `Token Safety — ${safety.symbol}`,
    `Risk: ${riskEmoji} ${safety.riskLevel.toUpperCase()} (score: ${safety.riskScore}/100)`,
    ``,
    `Honeypot: ${safety.isHoneypot ? "YES (DANGER)" : "No"}`,
    `Mintable: ${safety.isMintable ? "Yes (risk)" : "No"}`,
    `Pausable: ${safety.isPausable ? "Yes (risk)" : "No"}`,
    `Renounced: ${safety.isRenounced ? "Yes" : "No"}`,
    `LP Burned: ${safety.lpBurnPercent.toFixed(1)}%`,
    `Top10 Holders: ${safety.topHolderPercent.toFixed(1)}%`,
  ];

  return lines.join("\n");
}
