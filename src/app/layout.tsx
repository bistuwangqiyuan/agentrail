import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentRail — Payment OS for AI Agents",
  description:
    "Autonomous agent-to-agent settlement: x402-compatible, stablecoin-first, failover token swap. No human checkout.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <div className="grid-noise min-h-screen">
          <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
            <Link href="/" className="font-display text-2xl tracking-tight text-ink">
              AgentRail
            </Link>
            <nav className="flex gap-5 text-sm text-[var(--muted)]">
              <Link href="/docs" className="hover:text-ink">
                Docs
              </Link>
              <Link href="/demo" className="hover:text-ink">
                Demo
              </Link>
              <Link href="/status" className="hover:text-ink">
                Status
              </Link>
              <Link href="/legal" className="hover:text-ink">
                Legal
              </Link>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="mx-auto max-w-5xl px-6 py-10 text-sm text-[var(--muted)]">
            Agent-complete payment OS · runtime autonomous · legal liability stays with principal
          </footer>
        </div>
      </body>
    </html>
  );
}
