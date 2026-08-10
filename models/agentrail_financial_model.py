#!/usr/bin/env python3
"""
AgentRail（智轨支付）商业计划书 — 可复现财务与市场测算模型
============================================================
运行: python models/agentrail_financial_model.py
依赖: 仅标准库（无第三方包）

数据来源标注（模型外生参数）:
  [S1] BCG × Allium / McKinsey×Artemis / BIS 口径:
       2025 稳定币真实经济支付约 USD 350–550B；本模型取中位 450B
       （见 Tracee Stablecoin Market 2026; Reap Stablecoin Statistics 2026;
        Polygon「Stablecoin Payments for Enterprise」引 McKinsey Feb 2026 ≈390B）
  [S2] Gartner 2026-05 预测: AI Agent 软件支出
       2025 $86.4B → 2026 $206.5B → 2027 $376.3B
  [S3] McKinsey: 到 2030 全球 agentic commerce 可编排价值 $3–5T
  [S4] Coinbase / x402 Foundation: x402 为 Agent 支付开放协议；
       公开材料称已有千万级交易量级（白皮书/产品页，非审计财报）
  [S5] Nevermined 公开统计汇总: Agent 支付占稳定币总量极低（约 0.0001% 量级）
       —— 说明基础设施缺口，非精确市场份额审计

本模型原则:
  - 外生参数全部显式；情景分 Base / Bull / Bear
  - 不做无法验证的“保证回报”
  - 收入 = GMV × take_rate；成本按软件/合规/链上手续费结构估算
  - 所有区间用概率语言，不作绝对断言
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Tuple


# ---------------------------------------------------------------------------
# 外生参数（有出处 / 可调整）
# ---------------------------------------------------------------------------

STABLECOIN_REAL_PAYMENTS_2025_B = 450.0  # [S1] 中位，单位十亿美元
STABLECOIN_REAL_PAYMENTS_LOW_B = 350.0
STABLECOIN_REAL_PAYMENTS_HIGH_B = 550.0

AGENT_SOFTWARE_SPEND = {  # [S2] 十亿美元
    2025: 86.4,
    2026: 206.5,
    2027: 376.3,
}

AGENTIC_COMMERCE_2030_LOW_T = 3.0   # [S3] 万亿美元
AGENTIC_COMMERCE_2030_HIGH_T = 5.0

# Agent M2M / API / 算力微支付占“真实稳定币支付”的可服务比例（判断参数，非引用）
# 说明: 今天极低；本模型用“可寻址份额”而非“已实现份额”
M2M_ADDRESSABLE_SHARE = {
    "bear": 0.002,   # 0.2% of real stablecoin payments by Y3
    "base": 0.008,   # 0.8%
    "bull": 0.020,   # 2.0%
}

# AgentRail 在可寻址 M2M 支付中的目标份额（Y1–Y3）
PLATFORM_SHARE = {
    "bear": (0.001, 0.003, 0.008),
    "base": (0.002, 0.010, 0.030),
    "bull": (0.005, 0.025, 0.060),
}

# 费率：用户明确可接受“中间损耗更大”，换取全自动
# Stripe 卡支付常见 ~2.9%+$0.30；稳定币链上 gas 极低，平台 take 可高于纯 gas
TAKE_RATE = {
    "bear": 0.015,  # 1.5%
    "base": 0.025,  # 2.5%
    "bull": 0.035,  # 3.5%（含 swap 价差与托管便利溢价）
}

# 稳定币真实支付 YoY 增长（BCG 报道约 60% YoY；外推衰减）
STABLECOIN_PAY_GROWTH = {
    1: 0.50,  # Y1 vs 2025 baseline
    2: 0.40,
    3: 0.30,
}

# 运营成本结构（美元，软件优先、无全职团队假设下的外包/API/合规预算）
FIXED_OPEX_Y = {
    "bear": (180_000, 280_000, 420_000),
    "base": (240_000, 420_000, 680_000),
    "bull": (320_000, 600_000, 1_050_000),
}
# 可变成本占收入（链上 gas 补贴、流动性、托管、AML 筛查 API）
VARIABLE_COST_RATIO = {
    "bear": 0.45,
    "base": 0.38,
    "bull": 0.32,
}


@dataclass
class YearResult:
    year_index: int
    calendar_year: int
    stablecoin_real_pay_b: float
    m2m_addressable_b: float
    platform_gmv_b: float
    revenue_m: float
    opex_m: float
    contribution_m: float
    take_rate: float
    platform_share: float


def project_stablecoin_real_pay(base_b: float, years: int = 3) -> List[float]:
    """从 2025 基线外推 Y1..Yn 真实稳定币支付规模（十亿美元）。"""
    out = []
    level = base_b
    for y in range(1, years + 1):
        level = level * (1.0 + STABLECOIN_PAY_GROWTH[y])
        out.append(level)
    return out


def run_scenario(
    name: str,
    base_stablecoin_b: float,
    start_year: int = 2026,
) -> List[YearResult]:
    shares = PLATFORM_SHARE[name]
    take = TAKE_RATE[name]
    m2m_share = M2M_ADDRESSABLE_SHARE[name]
    fixed = FIXED_OPEX_Y[name]
    vcr = VARIABLE_COST_RATIO[name]
    levels = project_stablecoin_real_pay(base_stablecoin_b, 3)

    results: List[YearResult] = []
    for i, pay_b in enumerate(levels):
        # M2M 可寻址份额随年份线性爬坡到情景终值
        m2m_frac = m2m_share * ((i + 1) / 3.0)
        m2m_b = pay_b * m2m_frac
        gmv_b = m2m_b * shares[i]
        rev = gmv_b * 1e9 * take  # 美元
        opex = fixed[i] + rev * vcr
        contrib = rev - opex
        results.append(
            YearResult(
                year_index=i + 1,
                calendar_year=start_year + i,
                stablecoin_real_pay_b=round(pay_b, 2),
                m2m_addressable_b=round(m2m_b, 4),
                platform_gmv_b=round(gmv_b, 6),
                revenue_m=round(rev / 1e6, 3),
                opex_m=round(opex / 1e6, 3),
                contribution_m=round(contrib / 1e6, 3),
                take_rate=take,
                platform_share=shares[i],
            )
        )
    return results


def unit_economics(
    avg_ticket_usd: float = 0.50,
    take_rate: float = 0.025,
    gas_usd: float = 0.002,
    compliance_api_usd: float = 0.0005,
    infra_usd: float = 0.001,
) -> Dict[str, float]:
    """单笔微支付单位经济（以 API/算力调用为代表）。"""
    revenue = avg_ticket_usd * take_rate
    cogs = gas_usd + compliance_api_usd + infra_usd
    # 若票面极小，take 可能不足覆盖 gas → 需最小费或批量结算
    min_fee = 0.001  # $0.001 最低平台费
    effective_rev = max(revenue, min_fee)
    return {
        "avg_ticket_usd": avg_ticket_usd,
        "nominal_take_usd": round(revenue, 6),
        "effective_rev_usd": round(effective_rev, 6),
        "variable_cogs_usd": round(cogs, 6),
        "gross_margin_usd": round(effective_rev - cogs, 6),
        "gross_margin_pct": round((effective_rev - cogs) / effective_rev, 4)
        if effective_rev
        else 0.0,
        "breakeven_ticket_at_take": round(cogs / take_rate, 4) if take_rate else math.inf,
    }


def tam_sam_som_static() -> Dict[str, object]:
    """静态 TAM/SAM/SOM 框架（美元）。"""
    tam_agent_software_2026 = AGENT_SOFTWARE_SPEND[2026] * 1e9
    tam_stablecoin_pay_mid = STABLECOIN_REAL_PAYMENTS_2025_B * 1e9
    # SAM: 假设到 2028 左右 M2M/agent 支付可达真实稳定币支付的 1%（判断）
    sam = tam_stablecoin_pay_mid * 0.01 * (1.5 ** 3)  # 粗略三年复合扩张后的 1% 池
    # SOM base Y3 GMV * take — 由情景回填，这里给出框架占位算法
    return {
        "TAM_notes": {
            "agent_software_spend_2026_usd": tam_agent_software_2026,
            "stablecoin_real_payments_2025_mid_usd": tam_stablecoin_pay_mid,
            "agentic_commerce_2030_orchestrated_usd_range": [
                AGENTIC_COMMERCE_2030_LOW_T * 1e12,
                AGENTIC_COMMERCE_2030_HIGH_T * 1e12,
            ],
            "caveat": (
                "TAM 不可简单相加：Agent 软件支出 ≠ 支付 GMV；"
                "Agentic commerce 是编排交易额，支付基础设施只抽取其中结算层。"
            ),
        },
        "SAM_judgment_usd": round(sam, 0),
        "SAM_definition": (
            "可被 Agent 全自动结算的稳定币/链上支付池"
            "（API、算力、数据、Agent 服务互付），不含需强人工 KYC 的消费电商主路径。"
        ),
    }


def sensitivity_take_rate(
    gmv_b: float, rates: Tuple[float, ...] = (0.01, 0.015, 0.025, 0.035, 0.05)
) -> List[Dict[str, float]]:
    return [
        {"take_rate": r, "revenue_m": round(gmv_b * 1e9 * r / 1e6, 3)} for r in rates
    ]


def format_report(payload: Dict) -> str:
    lines = [
        "=" * 72,
        "AgentRail 财务与市场测算 — 可复现报告",
        "=" * 72,
        "",
        "【外生参数】",
        f"  稳定币真实支付 2025: ${STABLECOIN_REAL_PAYMENTS_LOW_B:.0f}–"
        f"{STABLECOIN_REAL_PAYMENTS_HIGH_B:.0f}B (mid ${STABLECOIN_REAL_PAYMENTS_2025_B:.0f}B) [S1]",
        f"  Agent 软件支出: {AGENT_SOFTWARE_SPEND} [S2]",
        f"  Agentic commerce 2030: ${AGENTIC_COMMERCE_2030_LOW_T}–"
        f"{AGENTIC_COMMERCE_2030_HIGH_T}T [S3]",
        "",
        "【TAM/SAM 框架】",
        json.dumps(payload["tam_sam"], ensure_ascii=False, indent=2),
        "",
        "【单位经济（微支付示例）】",
        json.dumps(payload["unit_econ"], ensure_ascii=False, indent=2),
        "",
    ]
    for scen, years in payload["scenarios"].items():
        lines.append(f"【情景 {scen.upper()}】 take={TAKE_RATE[scen]:.1%}  "
                     f"Y3_M2M_share={M2M_ADDRESSABLE_SHARE[scen]:.1%}")
        lines.append(
            f"{'Year':<6}{'Cal':<6}{'Stable$B':>10}{'M2M$B':>10}"
            f"{'GMV$B':>12}{'Rev$M':>10}{'OpEx$M':>10}{'Contrib$M':>12}"
        )
        for y in years:
            lines.append(
                f"{y['year_index']:<6}{y['calendar_year']:<6}"
                f"{y['stablecoin_real_pay_b']:>10.1f}"
                f"{y['m2m_addressable_b']:>10.3f}"
                f"{y['platform_gmv_b']:>12.4f}"
                f"{y['revenue_m']:>10.3f}"
                f"{y['opex_m']:>10.3f}"
                f"{y['contribution_m']:>12.3f}"
            )
        lines.append("")
    lines.append("【Y3 Base GMV 费率敏感性】")
    lines.append(json.dumps(payload["sensitivity"], ensure_ascii=False, indent=2))
    lines.append("")
    lines.append("【方法论声明】")
    lines.append("  1. 情景参数中 platform_share / m2m_share 为经营假设，非历史事实。")
    lines.append("  2. contribution ≠ 会计净利润（未含税、股权激励、诉讼准备金）。")
    lines.append("  3. 合规牌照与托管成本可能使 FIXED_OPEX 上修 2–5×；见 BP 合规章。")
    lines.append("  4. 复现: python models/agentrail_financial_model.py")
    return "\n".join(lines)


def main() -> None:
    scenarios = {}
    for name in ("bear", "base", "bull"):
        scenarios[name] = [asdict(y) for y in run_scenario(name, STABLECOIN_REAL_PAYMENTS_2025_B)]

    base_y3_gmv = scenarios["base"][2]["platform_gmv_b"]
    payload = {
        "tam_sam": tam_sam_som_static(),
        "unit_econ": unit_economics(),
        "scenarios": scenarios,
        "sensitivity": sensitivity_take_rate(base_y3_gmv),
        "sources": {
            "S1": "BCG/Allium, McKinsey/Artemis, BIS-cited real-economy stablecoin payments 2025",
            "S2": "Gartner AI agent software spend forecast (May 2026 coverage)",
            "S3": "McKinsey agentic commerce $3–5T by 2030",
            "S4": "x402 / Coinbase agentic payments protocol materials",
            "S5": "Nevermined agent-stablecoin stats compilation (directional)",
        },
    }

    out_dir = Path(__file__).resolve().parent.parent / "output"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "agentrail_model_results.json"
    txt_path = out_dir / "agentrail_model_report.txt"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    report = format_report(payload)
    txt_path.write_text(report, encoding="utf-8")
    print(report)
    print(f"\nJSON → {json_path}")
    print(f"TXT  → {txt_path}")


if __name__ == "__main__":
    main()
