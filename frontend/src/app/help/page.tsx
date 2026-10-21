import Link from "next/link";
import { ExternalLink, BookOpen, MessageCircle, Shield, Zap, HelpCircle } from "lucide-react";

const DOCS_URL = "https://docs.innov8.finance";
const GITHUB_URL = "https://github.com/Happybello365/innov8";
const STELLAR_DOCS_URL = "https://developers.stellar.org";
const FREIGHTER_URL = "https://www.freighter.app";
const DISCORD_URL = "https://discord.gg/innov8";
const STATUS_URL = "https://status.innov8.finance";

interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

function SafeExternalLink({ href, children, className }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}

const FAQ_ITEMS = [
  {
    question: "How do I connect my wallet?",
    answer:
      "Install the Freighter browser extension, then click "Connect Wallet" in the top navigation. Approve the connection request in the Freighter popup.",
  },
  {
    question: "What currencies are supported?",
    answer:
      "Innov8 currently supports cNGN (tokenised Nigerian Naira) on the Stellar network. More assets are planned for future releases.",
  },
  {
    question: "How does dispute resolution work?",
    answer:
      "If a trade cannot be completed, either party can raise a dispute. A neutral mediator reviews the evidence and issues a binding verdict.",
  },
  {
    question: "Is my wallet address exposed publicly?",
    answer:
      "Trade counterparties can see each other's Stellar addresses within a trade context. Addresses are not displayed to unrelated users.",
  },
  {
    question: "What are vault streams?",
    answer:
      "Vault streams let administrators schedule recurring token distributions directly on-chain via Stellar smart contracts.",
  },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 flex justify-center">
            <HelpCircle className="h-12 w-12 text-accent-primary" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary">Help &amp; Support</h1>
          <p className="mt-3 text-lg text-text-secondary">
            Find answers, browse documentation, and get in touch with our team.
          </p>
        </div>

        {/* Quick links */}
        <section className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SafeExternalLink
            href={DOCS_URL}
            className="flex items-start gap-3 rounded-xl border border-border-primary bg-bg-secondary p-5 transition-colors hover:border-accent-primary"
          >
            <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" />
            <div>
              <p className="font-semibold text-text-primary">Documentation</p>
              <p className="mt-1 text-sm text-text-secondary">
                Full guides, API reference, and integration tutorials.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-accent-primary">
                docs.innov8.finance <ExternalLink className="h-3 w-3" />
              </span>
            </div>
          </SafeExternalLink>

          <SafeExternalLink
            href={DISCORD_URL}
            className="flex items-start gap-3 rounded-xl border border-border-primary bg-bg-secondary p-5 transition-colors hover:border-accent-primary"
          >
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" />
            <div>
              <p className="font-semibold text-text-primary">Community Discord</p>
              <p className="mt-1 text-sm text-text-secondary">
                Chat with the community and get help from other traders.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-accent-primary">
                discord.gg/innov8 <ExternalLink className="h-3 w-3" />
              </span>
            </div>
          </SafeExternalLink>

          <SafeExternalLink
            href={STATUS_URL}
            className="flex items-start gap-3 rounded-xl border border-border-primary bg-bg-secondary p-5 transition-colors hover:border-accent-primary"
          >
            <Zap className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" />
            <div>
              <p className="font-semibold text-text-primary">System Status</p>
              <p className="mt-1 text-sm text-text-secondary">
                Check live uptime and incident history.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-accent-primary">
                status.innov8.finance <ExternalLink className="h-3 w-3" />
              </span>
            </div>
          </SafeExternalLink>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="mb-6 text-xl font-bold text-text-primary">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQ_ITEMS.map(({ question, answer }) => (
              <div
                key={question}
                className="rounded-xl border border-border-primary bg-bg-secondary p-5"
              >
                <p className="font-semibold text-text-primary">{question}</p>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* External resources */}
        <section className="mb-12">
          <h2 className="mb-6 text-xl font-bold text-text-primary">External Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <SafeExternalLink
              href={FREIGHTER_URL}
              className="flex items-center justify-between rounded-xl border border-border-primary bg-bg-secondary p-4 transition-colors hover:border-accent-primary"
            >
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-accent-primary" />
                <div>
                  <p className="font-medium text-text-primary">Freighter Wallet</p>
                  <p className="text-xs text-text-secondary">Official Stellar browser extension</p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-text-secondary" />
            </SafeExternalLink>

            <SafeExternalLink
              href={STELLAR_DOCS_URL}
              className="flex items-center justify-between rounded-xl border border-border-primary bg-bg-secondary p-4 transition-colors hover:border-accent-primary"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-accent-primary" />
                <div>
                  <p className="font-medium text-text-primary">Stellar Developer Docs</p>
                  <p className="text-xs text-text-secondary">Network documentation and SDKs</p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-text-secondary" />
            </SafeExternalLink>

            <SafeExternalLink
              href={`${GITHUB_URL}/issues`}
              className="flex items-center justify-between rounded-xl border border-border-primary bg-bg-secondary p-4 transition-colors hover:border-accent-primary"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="h-5 w-5 text-accent-primary" />
                <div>
                  <p className="font-medium text-text-primary">Report a Bug</p>
                  <p className="text-xs text-text-secondary">Open an issue on GitHub</p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-text-secondary" />
            </SafeExternalLink>

            <SafeExternalLink
              href={GITHUB_URL}
              className="flex items-center justify-between rounded-xl border border-border-primary bg-bg-secondary p-4 transition-colors hover:border-accent-primary"
            >
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-accent-primary" />
                <div>
                  <p className="font-medium text-text-primary">Source Code</p>
                  <p className="text-xs text-text-secondary">Innov8 is open-source on GitHub</p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-text-secondary" />
            </SafeExternalLink>
          </div>
        </section>

        {/* Back to app */}
        <div className="text-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
