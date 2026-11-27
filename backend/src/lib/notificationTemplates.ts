/**
 * Notification template registry and renderer (#473).
 * Placeholders use `{{name}}`; values are HTML-escaped and unknown placeholders are reported.
 */
export interface NotificationTemplate {
  key: string;
  title: string;
  message: string;
  variables: readonly string[];
}

export const NOTIFICATION_TEMPLATES: Readonly<Record<string, NotificationTemplate>> = {
  trade_funded: {
    key: "trade_funded",
    title: "Trade {{tradeId}} funded",
    message: "Escrow for trade {{tradeId}} has been funded with {{amount}}.",
    variables: ["tradeId", "amount"],
  },
  trade_delivered: {
    key: "trade_delivered",
    title: "Trade {{tradeId}} delivered",
    message: "The seller marked trade {{tradeId}} as delivered. Please confirm receipt.",
    variables: ["tradeId"],
  },
  dispute_opened: {
    key: "dispute_opened",
    title: "Dispute opened on trade {{tradeId}}",
    message: "A dispute was opened on trade {{tradeId}}. A mediator will review it shortly.",
    variables: ["tradeId"],
  },
  funds_released: {
    key: "funds_released",
    title: "Funds released for trade {{tradeId}}",
    message: "{{amount}} has been released for trade {{tradeId}}.",
    variables: ["tradeId", "amount"],
  },
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderedTemplate {
  key: string;
  title: string;
  message: string;
  missingVariables: string[];
}

export function renderNotificationTemplate(
  template: NotificationTemplate,
  variables: Record<string, string | number>,
): RenderedTemplate {
  const missing = new Set<string>();
  const fill = (text: string) =>
    text.replace(PLACEHOLDER, (_m, name: string) => {
      const v = variables[name];
      if (v === undefined || v === null) {
        missing.add(name);
        return `{{${name}}}`;
      }
      return escapeHtml(String(v));
    });
  return {
    key: template.key,
    title: fill(template.title),
    message: fill(template.message),
    missingVariables: [...missing].sort(),
  };
}
