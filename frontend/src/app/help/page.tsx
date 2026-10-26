import type { Metadata } from "next";
import { BookOpen, ExternalLink, HelpCircle, MessageCircle, Shield, Zap } from "lucide-react";
import { FAQ_SECTIONS, SUPPORT_EMAIL } from "./faq";

export const metadata: Metadata = {
  title: "Help & FAQ",
  description: "Answers to common questions about fees, disputes and cNGN, and how to contact support.",
};

const EXTERNAL_RESOURCES = [
  {
    href: "https://docs.innov8.finance",
    title: "Documentation",
    description: "Full guides, API reference, and integration tutorials.",
    Icon: BookOpen,
  },
  {
    href: "https://discord.gg/innov8",
    title: "Community Discord",
    description: "Chat with the community and get help from other traders.",
    Icon: MessageCircle,
  },
  {
    href: "https://status.innov8.finance",
    title: "System Status",
    description: "Check live uptime and incident history.",
    Icon: Zap,
  },
  {
    href: "https://www.freighter.app",
    title: "Freighter Wallet",
    description: "Official Stellar browser extension",
    Icon: Shield,
  },
  {
    href: "https://developers.stellar.org",
    title: "Stellar Developer Docs",
    description: "Network documentation and SDKs",
    Icon: BookOpen,
  },
  {
    href: "https://github.com/Happybello365/innov8/issues",
    title: "Report a Bug",
    description: "Open an issue on GitHub",
    Icon: HelpCircle,
  },
  {
    href: "https://github.com/Happybello365/innov8",
    title: "Source Code",
    description: "Innov8 is open-source on GitHub",
    Icon: Zap,
  },
];

export default function HelpPage() {
  return (
    <main className="px-6 py-8 max-w-3xl mx-auto space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-text-primary">Help &amp; FAQ</h1>
        <p className="text-text-secondary">
          Answers to the questions pilot users ask most. Can&apos;t find what you need? Contact support below.
        </p>
      </header>

      <nav aria-label="FAQ sections" className="flex flex-wrap gap-2">
        {FAQ_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-border-default px-3 py-1 text-sm text-text-secondary hover:text-gold"
          >
            {section.title}
          </a>
        ))}
      </nav>

      {FAQ_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="space-y-3">
          <h2 id={`${section.id}-title`} className="text-xl font-semibold text-text-primary">
            {section.title}
          </h2>
          {section.items.map((item) => (
            <details
              key={item.id}
              id={item.id}
              className="bg-bg-elevated rounded-lg border border-border-default p-4 group"
            >
              <summary className="cursor-pointer font-medium text-text-primary">{item.question}</summary>
              <div className="mt-3 space-y-2 text-text-secondary">
                {item.answer.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </details>
          ))}
        </section>
      ))}

      <section aria-labelledby="resources-title" className="space-y-3">
        <h2 id="resources-title" className="text-xl font-semibold text-text-primary">
          External resources
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {EXTERNAL_RESOURCES.map(({ href, title, description, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-elevated p-4 hover:border-gold"
            >
              <span className="flex items-center gap-3">
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-gold" />
                <span>
                  <span className="block font-medium text-text-primary">{title}</span>
                  <span className="block text-sm text-text-secondary">{description}</span>
                </span>
              </span>
              <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
            </a>
          ))}
        </div>
      </section>

      <section
        id="contact"
        aria-labelledby="contact-title"
        className="bg-bg-elevated rounded-lg border border-border-default p-6 space-y-2"
      >
        <h2 id="contact-title" className="text-xl font-semibold text-text-primary">
          Contact support
        </h2>
        <p className="text-text-secondary">
          Email{" "}
          <a className="text-gold underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . Include your trade ID if your question is about a specific trade. We will never ask for your
          recovery phrase or private key.
        </p>
      </section>
    </main>
  );
}
