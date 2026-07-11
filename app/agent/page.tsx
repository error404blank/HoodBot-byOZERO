import Image from "next/image";
import Link from "next/link";

const DOMAIN = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.V0_RUNTIME_URL ?? "https://your-domain.vercel.app";

// ── Endpoint reference data ───────────────────────────────────────────────────
const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/market",
    title: "Market Data",
    description: "Ambil harga, volume, dan info pool dari GeckoTerminal. Tidak butuh wallet.",
    params: [
      { name: "token", type: "query", required: false, desc: "Alamat token — tampilkan top pools untuk token ini" },
      { name: "pool", type: "query", required: false, desc: "Alamat pool — tampilkan detail satu pool spesifik" },
    ],
    example: `curl -H "X-API-Key: $HOODBOT_API_KEY" \\
  "${DOMAIN}/api/v1/market?token=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"`,
    response: `{
  "token": "0x0Bd7D...",
  "pools": [
    {
      "poolAddress": "0x...",
      "name": "WETH / USDG",
      "priceUsd": "3200.41",
      "volume24h": "128500.00",
      "liquidityUsd": "2400000"
    }
  ],
  "source": "GeckoTerminal"
}`,
  },
  {
    method: "GET",
    path: "/api/v1/wallets",
    title: "Daftar Wallet User",
    description: "Ambil semua wallet dan saldo ETH milik user berdasarkan Telegram ID.",
    params: [
      { name: "telegramId", type: "query", required: true, desc: "Telegram user ID (angka)" },
    ],
    example: `curl -H "X-API-Key: $HOODBOT_API_KEY" \\
  "${DOMAIN}/api/v1/wallets?telegramId=123456789"`,
    response: `{
  "telegramId": "123456789",
  "wallets": [
    { "id": 1, "name": "Wallet 1", "address": "0x...", "ethBalance": "0.05" }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/v1/positions",
    title: "LP Positions",
    description: "Ambil semua posisi LP yang masih aktif (belum ditutup) milik user.",
    params: [
      { name: "telegramId", type: "query", required: false, desc: "Filter per user. Kalau dikosongkan, tampilkan semua posisi (admin)" },
    ],
    example: `curl -H "X-API-Key: $HOODBOT_API_KEY" \\
  "${DOMAIN}/api/v1/positions?telegramId=123456789"`,
    response: `{
  "openPositions": 2,
  "positions": [
    { "id": 1, "version": "v3", "token0": "0x...", "token1": "0x...", "feeTier": 3000, "autoRebalance": false }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/lp",
    title: "LP Actions",
    description: "Trigger add liquidity V3, collect fees, atau cek info pool. Butuh PIN user untuk aksi yang melibatkan wallet.",
    params: [
      { name: "action", type: "body", required: true, desc: '"pool_info" | "add_v3" | "collect_fees"' },
      { name: "telegramId", type: "body", required: false, desc: "Wajib untuk add_v3 dan collect_fees" },
      { name: "walletId", type: "body", required: false, desc: "ID wallet dari /api/v1/wallets" },
      { name: "pin", type: "body", required: false, desc: "PIN 6 digit user — wajib untuk dekripsi private key" },
      { name: "token0 / token1", type: "body", required: false, desc: "Alamat token pair" },
      { name: "fee", type: "body", required: false, desc: "Fee tier: 100, 500, 3000, atau 10000" },
      { name: "amount0 / amount1", type: "body", required: false, desc: 'Jumlah token dalam satuan human-readable, contoh "0.01"' },
      { name: "rangePct", type: "body", required: false, desc: "Range liquidity dalam %, default 20. Contoh 20 = ±20% dari harga saat ini" },
    ],
    example: `# Cek info pool dulu (tidak butuh wallet)
curl -X POST -H "X-API-Key: $HOODBOT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "pool_info",
    "token0": "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    "token1": "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    "fee": 3000
  }' \\
  "${DOMAIN}/api/v1/lp"

# Add liquidity V3
curl -X POST -H "X-API-Key: $HOODBOT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "add_v3",
    "telegramId": "123456789",
    "walletId": 1,
    "pin": "123456",
    "token0": "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    "token1": "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    "fee": 3000,
    "amount0": "0.01",
    "amount1": "32",
    "rangePct": 20
  }' \\
  "${DOMAIN}/api/v1/lp"`,
    response: `{
  "success": true,
  "txHash": "0x...",
  "tokenId": "1234",
  "pool": "0x...",
  "tickLower": -887220,
  "tickUpper": 887220,
  "explorerUrl": "https://robinhoodchain.blockscout.com/tx/0x..."
}`,
  },
  {
    method: "POST",
    path: "/api/v1/nft",
    title: "NFT Actions",
    description: "Deteksi info kontrak NFT atau mint NFT ke wallet user.",
    params: [
      { name: "action", type: "body", required: true, desc: '"detect" | "mint"' },
      { name: "contractAddress", type: "body", required: true, desc: "Alamat kontrak NFT" },
      { name: "telegramId / walletId / pin", type: "body", required: false, desc: "Wajib untuk action mint" },
      { name: "quantity", type: "body", required: false, desc: "Jumlah NFT yang di-mint, default 1" },
    ],
    example: `# Deteksi kontrak NFT
curl -X POST -H "X-API-Key: $HOODBOT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"detect","contractAddress":"0x..."}' \\
  "${DOMAIN}/api/v1/nft"

# Mint NFT
curl -X POST -H "X-API-Key: $HOODBOT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "mint",
    "telegramId": "123456789",
    "walletId": 1,
    "pin": "123456",
    "contractAddress": "0x...",
    "quantity": 1
  }' \\
  "${DOMAIN}/api/v1/nft"`,
    response: `{
  "success": true,
  "txHash": "0x...",
  "tokenId": "42",
  "explorerUrl": "https://robinhoodchain.blockscout.com/tx/0x..."
}`,
  },
];

// ── Method badge ──────────────────────────────────────────────────────────────
function MethodBadge({ method }: { method: string }) {
  const color =
    method === "GET"
      ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
      : "text-yellow-400 border-yellow-400/30 bg-yellow-400/10";
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${color}`}>
      {method}
    </span>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wider">{label}</span>}
      <pre className="rounded border border-border bg-background p-3 text-xs font-mono text-primary overflow-x-auto whitespace-pre leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

// ── Param row ─────────────────────────────────────────────────────────────────
function ParamRow({ name, type, required, desc }: { name: string; type: string; required: boolean; desc: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2 min-w-0 sm:w-48 shrink-0">
        <code className="text-xs font-mono text-primary">{name}</code>
        <span className="text-xs font-mono text-muted-foreground/50 border border-border/50 rounded px-1">{type}</span>
        {required && <span className="text-xs font-mono text-red-400/70">required</span>}
      </div>
      <span className="text-xs font-mono text-muted-foreground leading-relaxed">{desc}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AgentPage() {
  const apiKey = "Set HOODBOT_API_KEY di env vars";

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="HoodBot" width={28} height={28} className="rounded-lg" />
          <div className="flex flex-col">
            <span className="font-mono font-bold text-sm text-foreground leading-tight">HoodBot</span>
            <span className="text-xs text-muted-foreground font-mono leading-none">AI Agent API</span>
          </div>
        </div>
        <Link
          href="/"
          className="text-xs font-mono text-muted-foreground hover:text-foreground border border-border/50 rounded px-3 py-1.5 transition-colors"
        >
          Dashboard
        </Link>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-10">

        {/* Intro */}
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-mono font-bold text-foreground text-balance">
            Integrasi AI Agent
          </h1>
          <p className="text-sm font-mono text-muted-foreground leading-relaxed">
            HoodBot menyediakan REST API yang bisa dipanggil oleh AI Agent kamu (Hermes, LangChain, AutoGPT, n8n, atau agen apapun)
            untuk membaca data pasar, melihat posisi LP, dan menjalankan aksi onchain secara otomatis di Robinhood Chain.
          </p>

          {/* Base URL */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wider">Base URL</span>
            <div className="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 px-3 py-2">
              <code className="text-sm font-mono text-primary">{DOMAIN}</code>
            </div>
          </div>

          {/* Auth */}
          <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Authentication</h2>
            <p className="text-xs font-mono text-muted-foreground leading-relaxed">
              Semua endpoint membutuhkan header <code className="text-primary">X-API-Key</code> dengan nilai dari env var{" "}
              <code className="text-primary">HOODBOT_API_KEY</code> yang kamu set di project ini.
            </p>
            <CodeBlock
              code={`# Set HOODBOT_API_KEY di Vercel env vars (Settings -> Vars)\n# Generate contoh key:\nopenssl rand -hex 32\n\n# Pakai di setiap request:\ncurl -H "X-API-Key: <HOODBOT_API_KEY>" https://...`}
              label="Setup API Key"
            />
          </div>

          {/* Hermes prompt example */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-col gap-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-primary/70">Contoh System Prompt untuk Hermes</h2>
            <p className="text-xs font-mono text-muted-foreground leading-relaxed">
              Tambahkan instruksi berikut ke system prompt AI Agent Hermes kamu agar agent mengerti cara menggunakan HoodBot API:
            </p>
            <CodeBlock
              label="System prompt snippet"
              code={`You have access to HoodBot API at ${DOMAIN}.
Always include header X-API-Key: <HOODBOT_API_KEY> in every request.

Available tools:
- GET /api/v1/market?token=<address> — get token price and top pools
- GET /api/v1/wallets?telegramId=<id> — list user wallets
- GET /api/v1/positions?telegramId=<id> — list open LP positions
- POST /api/v1/lp (action: pool_info | add_v3 | collect_fees) — LP actions
- POST /api/v1/nft (action: detect | mint) — NFT detection and minting

All onchain actions (add_v3, collect_fees, mint) require the user's 6-digit PIN
to decrypt their wallet. Always ask the user for their PIN before executing
any transaction. Never store or log the PIN.`}
            />
          </div>
        </section>

        {/* Endpoint Reference */}
        <section className="flex flex-col gap-6">
          <h2 className="text-lg font-mono font-bold text-foreground">Referensi Endpoint</h2>

          {ENDPOINTS.map((ep) => (
            <div key={ep.path} className="rounded-lg border border-border bg-card flex flex-col">
              {/* Endpoint header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <MethodBadge method={ep.method} />
                <code className="text-sm font-mono text-foreground font-semibold">{ep.path}</code>
                <span className="text-xs font-mono text-muted-foreground hidden sm:inline">{ep.title}</span>
              </div>

              <div className="p-4 flex flex-col gap-4">
                <p className="text-xs font-mono text-muted-foreground leading-relaxed">{ep.description}</p>

                {/* Params */}
                <div className="flex flex-col">
                  <span className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wider mb-1">Parameters</span>
                  <div className="rounded border border-border/50 divide-y divide-border/40 px-2">
                    {ep.params.map((p) => (
                      <ParamRow key={p.name} {...p} />
                    ))}
                  </div>
                </div>

                {/* Example */}
                <CodeBlock code={ep.example} label="Contoh Request" />
                <CodeBlock code={ep.response} label="Contoh Response" />
              </div>
            </div>
          ))}
        </section>

        {/* Footer */}
        <footer className="border-t border-border pt-6">
          <p className="text-xs font-mono text-muted-foreground/50 text-center">
            HoodBot REST API — Robinhood Chain (4663) — Uniswap V3/V4
          </p>
        </footer>
      </div>
    </main>
  );
}
