/** Format ETH amount: trim trailing zeros */
export function formatEth(value: string | number, decimals = 6): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return "0";
  return n.toFixed(decimals).replace(/\.?0+$/, "");
}

/** Format USD with M/K suffix */
export function formatUsd(value: string | number): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

/** Format a number with commas */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** Shorten TX hash: 0x1234...abcd */
export function shortHash(hash: string): string {
  if (hash.length < 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

/** Shorten address: 0x1234...abcd */
export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Convert basis points to percentage string */
export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** Fee tier to percentage */
export function feeTierToPercent(feeTier: number): string {
  return `${(feeTier / 10000).toFixed(2)}%`;
}

/** Escape HTML special chars for Telegram HTML parse mode */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
