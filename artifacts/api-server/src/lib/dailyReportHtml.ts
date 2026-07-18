import type { DailyReportPayload } from "./dailyReportAssemble";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pctDelta(day: number, avg: number): string {
  if (!avg) return "—";
  const pct = Math.round(((day - avg) / avg) * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs 7-day avg`;
}

function sparkline(values: number[]): string {
  if (values.length < 2) return "";
  const w = 280;
  const h = 56;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="7-day sales trend"><polyline fill="none" stroke="#0F766E" stroke-width="2.5" points="${pts}"/></svg>`;
}

function hourBars(
  hours: { hour: number; orderCount: number }[],
  peak: number | null,
): string {
  if (!hours.length) return "<p style=\"color:#6b7280;font-size:13px\">No hour data</p>";
  const max = Math.max(...hours.map((h) => h.orderCount), 1);
  const cells = hours
    .map((h) => {
      const ht = Math.max(4, Math.round((h.orderCount / max) * 48));
      const color = h.hour === peak ? "#DC2626" : "#0F766E";
      return `<td style="vertical-align:bottom;padding:0 2px;text-align:center"><div style="height:${ht}px;width:8px;background:${color};margin:0 auto;border-radius:2px"></div><div style="font-size:9px;color:#6b7280;margin-top:2px">${h.hour}</div></td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

function paragraphsHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font-size:15px;color:#0F172A;line-height:1.55">${esc(p)}</p>`,
    )
    .join("");
}

export function renderDailyReportHtml(p: DailyReportPayload): string {
  const day = p.day;
  const avg = p.avg7d;

  const attentionText =
    p.narrative.attention ||
    (p.reputation.urgent.length
      ? p.reputation.urgent
          .map((u) => `${u.classification} (${u.platform}): “${u.excerpt}”`)
          .join(" · ")
      : "");

  const urgentHtml =
    attentionText || p.reputation.urgent.length || p.reputation.unanswered.length
      ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 16px;margin:0 0 20px">
          <div style="color:#991B1B;font-weight:800;font-size:13px;letter-spacing:0.04em">⚠ NEEDS ATTENTION</div>
          ${
            attentionText
              ? `<p style="margin:8px 0 0;color:#7F1D1D;font-size:14px;line-height:1.45">${esc(attentionText)}</p>`
              : ""
          }
          ${p.reputation.urgent
            .map(
              (u) =>
                `<p style="margin:8px 0 0;color:#7F1D1D;font-size:14px"><strong>${esc(u.classification)}</strong> (${esc(u.platform)}): “${esc(u.excerpt)}”</p>`,
            )
            .join("")}
          ${
            p.reputation.unanswered.length
              ? `<p style="margin:10px 0 0;color:#9A3412;font-size:13px"><strong>${p.reputation.unanswered.length} unanswered</strong> in social inbox (new / drafted / pending approval).</p>`
              : ""
          }
        </div>`
      : "";

  const cards = day
    ? [
        ["Total sales", money(day.totalSalesCents), avg ? pctDelta(day.totalSalesCents, avg.totalSalesCents) : ""],
        ["Orders", String(day.orderCount), avg ? pctDelta(day.orderCount, avg.orderCount) : ""],
        ["Customers", String(day.uniqueCustomers), avg ? pctDelta(day.uniqueCustomers, avg.uniqueCustomers) : ""],
        ["Avg ticket", money(day.avgNetSalesCents), avg ? pctDelta(day.avgNetSalesCents, avg.avgNetSalesCents) : ""],
      ]
    : [];

  const cardHtml = cards
    .map(
      ([label, value, sub]) =>
        `<td style="width:25%;padding:8px">
          <div style="background:#F8FAFC;border-radius:10px;padding:12px;border:1px solid #E2E8F0">
            <div style="font-size:11px;color:#64748B;font-weight:700;text-transform:uppercase">${esc(label)}</div>
            <div style="font-size:22px;font-weight:800;color:#0F172A;margin-top:4px">${esc(value)}</div>
            <div style="font-size:11px;color:#0F766E;margin-top:4px">${esc(sub)}</div>
          </div>
        </td>`,
    )
    .join("");

  const products = p.topProducts
    .map(
      (it, i) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;font-size:14px">${i === 0 ? "⭐ " : ""}${esc(it.name)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;font-size:14px;text-align:right;color:#64748B">${it.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;font-size:14px;text-align:right;font-weight:700">${money(it.netSalesCents)}</td>
        </tr>`,
    )
    .join("");

  const channels = p.orderlyChannels.length
    ? p.orderlyChannels
        .map(
          (c) =>
            `<tr>
              <td style="padding:6px 0;font-size:14px">${esc(c.src)}${c.src.includes("google") ? " <span style=\"color:#0F766E;font-size:11px;font-weight:700\">no marketplace fee</span>" : ""}</td>
              <td style="padding:6px 0;font-size:14px;text-align:right">${c.orders}</td>
              <td style="padding:6px 0;font-size:14px;text-align:right;font-weight:700">${money(c.totalCents)}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="font-size:13px;color:#64748B">No paid online orders attributed yesterday.</td></tr>`;

  const insights = p.insights.length
    ? p.insights
        .map(
          (ins) =>
            `<li style="margin:0 0 8px;font-size:14px;color:#0F172A;line-height:1.45">${esc(ins)}</li>`,
        )
        .join("")
    : `<li style="font-size:13px;color:#64748B">Not enough data for insights today.</li>`;

  const squareNote = p.squareAvailable
    ? ""
    : `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px;margin:0 0 16px;font-size:13px;color:#92400E">
        Square data unavailable${p.squareError ? `: ${esc(p.squareError.slice(0, 180))}` : ""}. Showing Orderly attribution / reputation only — totals may be incomplete.
      </div>`;

  const tipTax =
    day
      ? `<p style="font-size:12px;color:#64748B;margin:8px 0 0">Tips ${money(day.tipsCents)} · Tax ${money(day.taxCents)} · Source: Square (all channels)</p>`
      : "";

  const qrHtml = `<p style="font-size:13px;color:#334155;margin:0">
    Human ${p.qrScans.human} · Bot/preview ${p.qrScans.bot} · Total ${p.qrScans.total}
  </p>
  ${
    p.qrScans.bySrc.length
      ? `<p style="font-size:12px;color:#64748B;margin:6px 0 0">${p.qrScans.bySrc
          .slice(0, 5)
          .map((s) => `${esc(s.src)}: ${s.human} human`)
          .join(" · ")}</p>`
      : ""
  }`;

  const postsHtml = `<p style="font-size:13px;color:#334155;margin:0">
    Drafted ${p.socialPosts.drafted} · Pending/approved ${p.socialPosts.pendingApproval} · Posted ${p.socialPosts.posted}
  </p>
  ${p.socialPosts.highlights
    .map(
      (h) =>
        `<p style="font-size:12px;color:#475569;margin:6px 0 0">${esc(h.itemName)} (${esc(h.platform)}): ${h.clicks} clicks → ${h.orders} orders · ${money(h.revenueCents)}</p>`,
    )
    .join("")}`;

  const gbpHtml = p.gbp.available
    ? `<p style="font-size:13px;color:#334155;margin:0">Reviews ${p.gbp.reviews} · Q&amp;A ${p.gbp.questions} · Unanswered ${p.gbp.unanswered}</p>
       ${p.gbp.quotes
         .map(
           (q) =>
             `<p style="font-size:12px;color:#475569;margin:6px 0 0">${q.stars != null ? `${q.stars}★ ` : ""}“${esc(q.excerpt)}”</p>`,
         )
         .join("")}`
    : `<p style="font-size:13px;color:#64748B;margin:0">${esc(p.gbp.note || "Google reviews not available yet.")}</p>`;

  const supplyHtml = p.supplyReminder
    ? `<div style="background:#F0FDFA;border:1px solid #99F6E4;border-radius:10px;padding:14px 16px;margin:24px 0 0">
        <div style="color:#0F766E;font-weight:800;font-size:13px;letter-spacing:0.04em">SUPPLY REMINDER (from sales)</div>
        <p style="margin:8px 0 0;color:#134E4A;font-size:14px;line-height:1.45">${esc(p.supplyReminder)}</p>
        <p style="margin:6px 0 0;font-size:11px;color:#64748B">Level 1 — usage from weekly sales only. Not a prediction of days remaining.</p>
      </div>`
    : "";

  const praiseHtml = p.reputation.quotes.length
    ? p.reputation.quotes
        .map(
          (q) =>
            `<p style="font-size:13px;color:#475569;margin:8px 0 0">“${esc(q.excerpt)}” <span style="color:#94A3B8">— ${esc(q.classification)}</span></p>`,
        )
        .join("")
    : `<p style="font-size:13px;color:#64748B;margin:0">No praise quotes captured yesterday.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:16px;padding:24px;border:1px solid #E2E8F0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;color:#0F766E">ORDERLY DAILY</div>
          <h1 style="margin:6px 0 0;font-size:22px;color:#0F172A">${esc(p.restaurantName)}</h1>
          <p style="margin:4px 0 0;color:#64748B;font-size:13px">${esc(p.reportDate)} · ${esc(p.timeZone)}</p>
        </div>
        <div style="font-size:11px;font-weight:700;color:#0F766E;border:1px solid #99F6E4;background:#F0FDFA;border-radius:999px;padding:6px 10px">Verified</div>
      </div>

      ${urgentHtml}
      ${squareNote}

      <div style="margin:8px 0 4px">
        <p style="margin:0 0 12px;font-size:16px;color:#0F172A;font-weight:600;line-height:1.45">${esc(p.narrative.greeting)}</p>
        ${paragraphsHtml(p.narrative.body)}
      </div>

      ${
        p.narrative.ideaForToday
          ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px 16px;margin:8px 0 20px">
              <div style="color:#92400E;font-weight:800;font-size:12px;letter-spacing:0.04em">💡 ONE IDEA FOR TODAY</div>
              <p style="margin:8px 0 0;color:#78350F;font-size:14px;line-height:1.45">${esc(p.narrative.ideaForToday)}</p>
            </div>`
          : ""
      }

      <h2 style="font-size:13px;margin:28px 0 8px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em">Numbers detail</h2>

      <h3 style="font-size:15px;margin:12px 0 8px;color:#0F172A">Sales yesterday (all channels)</h3>
      ${
        day
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cardHtml}</tr></table>${tipTax}`
          : `<p style="color:#64748B;font-size:14px">No Square daily row for ${esc(p.reportDate)}.</p>`
      }

      <h3 style="font-size:15px;margin:24px 0 8px;color:#0F172A">7-day trend</h3>
      ${sparkline(p.trend7d.map((d) => d.totalSalesCents)) || `<p style="color:#64748B;font-size:13px">Trend needs Square data.</p>`}

      <h3 style="font-size:15px;margin:24px 0 8px;color:#0F172A">Busiest hours (last 7 days)</h3>
      ${hourBars(p.busyHours, p.peakHour)}
      ${
        p.peakHour != null
          ? `<p style="font-size:12px;color:#64748B;margin:8px 0 0">Peak marked in red · staff before the rush; schedule posts 1–2h earlier.</p>`
          : ""
      }

      <h3 style="font-size:15px;margin:24px 0 8px;color:#0F172A">Top products (last 7 days)</h3>
      <table width="100%" cellpadding="0" cellspacing="0">${products || `<tr><td style="color:#64748B;font-size:13px">No product mix data.</td></tr>`}</table>

      <h3 style="font-size:15px;margin:24px 0 4px;color:#0F172A">Online attribution (Orderly)</h3>
      <p style="font-size:12px;color:#B45309;margin:0 0 8px">Subset of Square — do not add these dollars to the totals above.</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr style="color:#64748B;font-size:11px;text-transform:uppercase">
          <th align="left" style="padding-bottom:6px">Channel / src</th>
          <th align="right" style="padding-bottom:6px">Orders</th>
          <th align="right" style="padding-bottom:6px">$</th>
        </tr>
        ${channels}
      </table>

      <h3 style="font-size:15px;margin:24px 0 8px;color:#0F172A">QR scans yesterday</h3>
      ${qrHtml}

      <h3 style="font-size:15px;margin:24px 0 8px;color:#0F172A">Social posts</h3>
      ${postsHtml}

      <h3 style="font-size:15px;margin:24px 0 8px;color:#0F172A">Reputation</h3>
      <p style="font-size:13px;color:#334155;margin:0">
        Praise ${p.reputation.buckets.praise} · Questions ${p.reputation.buckets.question} ·
        Complaints ${p.reputation.buckets.complaint} · Health/allergy ${p.reputation.buckets.allergy_health}
      </p>
      ${praiseHtml}

      <h3 style="font-size:15px;margin:24px 0 8px;color:#0F172A">Google reviews</h3>
      ${gbpHtml}

      <p style="font-size:12px;color:#94A3B8;margin:16px 0 0">${esc(p.foodDrinkNote)}</p>

      <h3 style="font-size:15px;margin:24px 0 8px;color:#0F172A">⭐ Fact bullets</h3>
      <ul style="padding-left:18px;margin:0">${insights}</ul>

      ${supplyHtml}

      <p style="margin:28px 0 0;font-size:11px;color:#94A3B8;line-height:1.5">
        ${esc(p.disclaimer)} · Verified &amp; permanently recorded where orders are anchored.
        ${p.narrative.source === "ai" ? " · Narrative by AI Gateway (facts only)." : " · Narrative from structured facts (AI unavailable)."}
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function renderDailyReportSubject(p: DailyReportPayload): string {
  const total = p.day ? money(p.day.totalSalesCents) : "update";
  return `${p.restaurantName} · ${p.reportDate} · ${total}`;
}
