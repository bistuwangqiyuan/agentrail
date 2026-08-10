export type AgentRailClientOptions = {
  baseUrl: string;
  apiKey: string;
};

/**
 * Minimal Agent SDK: wraps fetch to auto-pay on HTTP 402.
 * No human login, captcha, or checkout UI.
 */
export class AgentRailClient {
  constructor(private opts: AgentRailClientOptions) {}

  private headers(extra?: HeadersInit): HeadersInit {
    return {
      "Content-Type": "application/json",
      "X-Api-Key": this.opts.apiKey,
      ...extra,
    };
  }

  async pay(resourceId: string, intentId?: string) {
    const res = await fetch(`${this.opts.baseUrl}/api/v1/pay`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ resource_id: resourceId, intent_id: intentId }),
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.message || data.error), { data, status: res.status });
    return data;
  }

  async fetchPaid(path: string, init: RequestInit = {}) {
    const url = path.startsWith("http") ? path : `${this.opts.baseUrl}${path}`;
    const first = await fetch(url, {
      ...init,
      headers: this.headers(init.headers),
    });

    if (first.status !== 402) {
      return first.json();
    }

    const challenge = await first.json();
    const resourceId =
      challenge?.quote?.resource_id ||
      String(path).split("/").filter(Boolean).pop();

    if (!resourceId) throw new Error("402 without resource id");

    await this.pay(resourceId);

    const second = await fetch(url, {
      ...init,
      headers: this.headers({
        ...(init.headers || {}),
        "X-PAYMENT": "auto",
      }),
    });
    return second.json();
  }
}
