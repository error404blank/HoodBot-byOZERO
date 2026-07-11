"use client";

interface NftMint {
  id: number;
  contractAddress: string;
  quantity: number;
  txHash: string | null;
  mintedAt: Date | null;
}

interface NftMintsTableProps {
  mints: NftMint[];
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function NftMintsTable({ mints }: NftMintsTableProps) {
  if (mints.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground font-mono text-sm">No NFT mints yet</p>
        <p className="text-muted-foreground/60 text-xs mt-1">Use the bot&apos;s /nft command to mint</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">Contract</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">Qty</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">TX Hash</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">Date</th>
            </tr>
          </thead>
          <tbody>
            {mints.map((mint) => (
              <tr key={mint.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-foreground">{shortAddr(mint.contractAddress)}</td>
                <td className="px-4 py-3 text-primary font-bold">{mint.quantity}</td>
                <td className="px-4 py-3">
                  {mint.txHash ? (
                    <a
                      href={`https://robinhoodchain.blockscout.com/tx/${mint.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-primary transition-colors"
                    >
                      {shortAddr(mint.txHash)}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Pending</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {mint.mintedAt
                    ? new Date(mint.mintedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
