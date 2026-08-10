/**
 * Full AgentRail SDK — every operation is agent-callable.
 * Carry wallet_state across requests for cold-start autonomy.
 */
export type AgentRailClientOptions = {
  baseUrl: string;
  apiKey?: string;
  walletState?: string;
};

export class AgentRailClient {
  apiKey?: string;
  walletState?: string;
  address?: string;

  constructor(private opts: AgentRailClientOptions) {
    this.apiKey = opts.apiKey;
    this.walletState = opts.walletState;
  }

  private headers(extra?: HeadersInit): HeadersInit {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "X-Api-Key": this.apiKey } : {}),
      ...(this.walletState ? { "X-Wallet-State": this.walletState } : {}),
      ...extra,
    };
  }

  private absorb(data: Record<string, unknown>) {
    if (typeof data.wallet_state === "string") this.walletState = data.wallet_state;
    if (typeof data.api_key === "string") this.apiKey = data.api_key;
    if (typeof data.address === "string") this.address = data.address;
    const agent = data.agent as { address?: string } | undefined;
    if (agent?.address) this.address = agent.address;
  }

  private async req(method: string, path: string, body?: unknown, extraHeaders?: HeadersInit) {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      method,
      headers: this.headers(extraHeaders),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    if (data && typeof data === "object") this.absorb(data as Record<string, unknown>);
    return { status: res.status, data };
  }

  async openapi() {
    return this.req("GET", "/api/v1/openapi");
  }

  async createPrincipal(name: string) {
    return this.req("POST", "/api/v1/principals", { name });
  }

  async provisionAgent(input: Record<string, unknown> = {}) {
    const r = await this.req("POST", "/api/v1/agents", {
      auto_principal: true,
      principal_name: input.principal_name || "SDK Principal",
      ...input,
    });
    if (r.data?.api_key) this.apiKey = r.data.api_key;
    if (r.data?.wallet_state) this.walletState = r.data.wallet_state;
    if (r.data?.address) this.address = r.data.address;
    return r;
  }

  async me() {
    return this.req("GET", "/api/v1/agents");
  }

  async topup(funds: { usdc?: number; usdt?: number; eurc?: number }) {
    return this.req("PUT", "/api/v1/agents", {
      action: "topup",
      fund_usdc: funds.usdc || 0,
      fund_usdt: funds.usdt || 0,
      fund_eurc: funds.eurc || 0,
    });
  }

  async updatePolicy(policy: Record<string, unknown>) {
    return this.req("PUT", "/api/v1/agents", { action: "policy", ...policy });
  }

  async listResources() {
    return this.req("GET", "/api/v1/resources");
  }

  async createResource(input: Record<string, unknown>) {
    return this.req("POST", "/api/v1/resources", input);
  }

  async pay(resourceId: string, opts: { intentId?: string; resourceToken?: string } = {}) {
    return this.req("POST", "/api/v1/pay", {
      resource_id: resourceId,
      intent_id: opts.intentId,
      resource_token: opts.resourceToken,
    });
  }

  async fetchPaid(path: string) {
    const urlPath = path.startsWith("http")
      ? new URL(path).pathname + new URL(path).search
      : path;
    const first = await this.req("GET", urlPath);
    if (first.status !== 402) return first;

    const resourceId =
      first.data?.quote?.resource_id ||
      urlPath.split("/").filter(Boolean).pop();
    const token = first.data?.resource_token;
    await this.pay(String(resourceId), { resourceToken: token });
    return this.req("GET", urlPath, undefined, { "X-PAYMENT": "auto" });
  }

  async verifyTx(hash: string) {
    return this.req("GET", `/api/v1/chain/tx/${hash}`);
  }

  async ledger(agentId?: string) {
    const q = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
    return this.req("GET", `/api/v1/ledger${q}`);
  }

  async cycle(input: Record<string, unknown> = {}) {
    return this.req("POST", "/api/v1/agent/cycle", input);
  }

  async demoE2E(reset = true) {
    return this.req("POST", "/api/v1/demo/e2e", { reset });
  }
}
