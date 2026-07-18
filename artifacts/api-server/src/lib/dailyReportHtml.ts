import type { DailyReportPayload } from "./dailyReportAssemble";
import { formatPctVs7d, langLocale, uiForLang } from "./dailyReportI18n";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(cents: number, locale = "en-US"): string {
  return `$${(cents / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pctDelta(day: number, avg: number, lang: "en" | "id" | "es"): string {
  if (!avg) return "—";
  const pct = Math.round(((day - avg) / avg) * 100);
  return formatPctVs7d(pct, lang);
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
  noData: string,
): string {
  if (!hours.length) {
    return `<p style="color:#6b7280;font-size:13px">${esc(noData)}</p>`;
  }
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
        `<p style="margin:0 0 10px;font-size:14px;color:#0F172A;line-height:1.5">${esc(p)}</p>`,
    )
    .join("");
}

export function renderDailyReportHtml(p: DailyReportPayload): string {
  const lang = p.language || "en";
  const ui = uiForLang(lang);
  const locale = langLocale(lang);
  const day = p.day;
  const avg = p.avg7d;

  const attentionText = p.narrative.attention;
  const urgentHtml =
    attentionText || p.reputation.urgent.length
      ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 16px;margin:0 0 16px">
          <div style="color:#991B1B;font-weight:800;font-size:13px;letter-spacing:0.04em">${esc(ui.needsAttention)}</div>
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
        </div>`
      : "";

  const cards = day
    ? [
        [ui.totalSales, money(day.totalSalesCents, locale), avg ? pctDelta(day.totalSalesCents, avg.totalSalesCents, lang) : ""],
        [ui.orders, String(day.orderCount), avg ? pctDelta(day.orderCount, avg.orderCount, lang) : ""],
        [ui.customers, String(day.uniqueCustomers), avg ? pctDelta(day.uniqueCustomers, avg.uniqueCustomers, lang) : ""],
        [ui.avgTicket, money(day.avgNetSalesCents, locale), avg ? pctDelta(day.avgNetSalesCents, avg.avgNetSalesCents, lang) : ""],
      ]
    : [];

  const cardHtml = cards
    .map(
      ([label, value, sub]) =>
        `<td style="width:25%;padding:6px">
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
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;font-size:14px;text-align:right;font-weight:700">${money(it.netSalesCents, locale)}</td>
        </tr>`,
    )
    .join("");

  const channels = p.orderlyChannels.length
    ? p.orderlyChannels
        .map(
          (c) =>
            `<tr>
              <td style="padding:6px 0;font-size:14px">${esc(c.src)}${c.src.includes("google") ? ` <span style="color:#0F766E;font-size:11px;font-weight:700">${esc(ui.noMarketplaceFee)}</span>` : ""}</td>
              <td style="padding:6px 0;font-size:14px;text-align:right">${c.orders}</td>
              <td style="padding:6px 0;font-size:14px;text-align:right;font-weight:700">${money(c.totalCents, locale)}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="font-size:13px;color:#64748B">${esc(ui.noOnlineOrders)}</td></tr>`;

  const insights = p.insights.length
    ? p.insights
        .map(
          (ins) =>
            `<li style="margin:0 0 8px;font-size:14px;color:#0F172A;line-height:1.45">${esc(ins)}</li>`,
        )
        .join("")
    : `<li style="font-size:13px;color:#64748B">—</li>`;

  const squareNote = p.squareAvailable
    ? ""
    : `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px;margin:0 0 16px;font-size:13px;color:#92400E">
        ${esc(ui.squareUnavailable)}${p.squareError ? ` ${esc(p.squareError.slice(0, 180))}` : ""}
      </div>`;

  const tipTax =
    day
      ? `<p style="font-size:12px;color:#64748B;margin:8px 0 0">${esc(ui.tipsTax(money(day.tipsCents, locale), money(day.taxCents, locale)))}</p>`
      : "";

  const q = p.reputation.buckets.question;
  const uAll = p.reputation.unanswered.length;
  const menuAsk = p.reputation.buckets.menu_suggestion ?? 0;
  const reputationSummary =
    `${ui.praise} ${p.reputation.buckets.praise} · ${ui.questions} ${q}` +
    (q > 0 || uAll > 0 ? ` ${ui.unansweredParen(uAll)}` : "") +
    ` · ${ui.complaints} ${p.reputation.buckets.complaint} · ${ui.healthAllergy} ${p.reputation.buckets.allergy_health}` +
    (menuAsk > 0 ? ` · ${ui.menuSuggestions} ${menuAsk}` : "");

  const praiseHtml = p.reputation.quotes.length
    ? p.reputation.quotes
        .map(
          (qot) =>
            `<p style="font-size:13px;color:#475569;margin:8px 0 0">“${esc(qot.excerpt)}” <span style="color:#94A3B8">— ${esc(qot.classification)}</span></p>`,
        )
        .join("")
    : `<p style="font-size:13px;color:#64748B;margin:0">${esc(ui.noPraise)}</p>`;

  const anomalyHtml = p.socialPosts.clickAnomalies.length
    ? `<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:12px 14px;margin:16px 0 0">
        <div style="color:#9A3412;font-weight:800;font-size:12px;letter-spacing:0.04em">${esc(ui.clickOrderGap)}</div>
        ${p.socialPosts.clickAnomalies
          .map(
            (a) =>
              `<p style="margin:6px 0 0;font-size:13px;color:#7C2D12">${esc(a.itemName)}: <strong>${a.clicks} clicks → ${a.orders} orders (any item via link)</strong>` +
              ` · promoted item: <strong>${a.ordersPromotedItem}</strong>` +
              `${a.srcTag ? ` <span style="color:#9A3412">(${esc(a.srcTag)})</span>` : ""}</p>`,
          )
          .join("")}
        <p style="margin:6px 0 0;font-size:11px;color:#9A3412">${esc(ui.clickOrderGapNote)}</p>
      </div>`
    : "";

  const gsc = p.gsc;
  const gscRows = (rows: typeof gsc.topQueries) =>
    rows
      .map(
        (r) =>
          `<tr>
            <td style="padding:6px 0;font-size:13px">${esc(r.query)}</td>
            <td style="padding:6px 0;font-size:13px;text-align:right">${r.impressions}</td>
            <td style="padding:6px 0;font-size:13px;text-align:right">${r.clicks}</td>
            <td style="padding:6px 0;font-size:13px;text-align:right">${r.position.toFixed(1)}</td>
          </tr>`,
      )
      .join("");
  const gscHtml = `<div style="margin:22px 0 0">
      <h2 style="font-size:15px;margin:0 0 8px;color:#0F172A">${esc(ui.gscTitle)}</h2>
      <p style="font-size:12px;color:#64748B;margin:0 0 8px">${esc(gsc.note)}</p>
      ${
        gsc.topQueries.length
          ? `<p style="font-size:12px;font-weight:700;color:#0F766E;margin:8px 0 4px">Top positions</p>
             <table width="100%" cellpadding="0" cellspacing="0">
               <tr style="color:#64748B;font-size:11px"><th align="left">Query</th><th align="right">Impr</th><th align="right">Clicks</th><th align="right">Pos</th></tr>
               ${gscRows(gsc.topQueries)}
             </table>`
          : ""
      }
      ${
        gsc.opportunities.length
          ? `<p style="font-size:12px;font-weight:700;color:#9A3412;margin:12px 0 4px">Near-win opportunities (pos 5–20)</p>
             <table width="100%" cellpadding="0" cellspacing="0">
               <tr style="color:#64748B;font-size:11px"><th align="left">Query</th><th align="right">Impr</th><th align="right">Clicks</th><th align="right">Pos</th></tr>
               ${gscRows(gsc.opportunities)}
             </table>`
          : ""
      }
      ${
        gsc.movers.length
          ? `<p style="font-size:12px;font-weight:700;color:#334155;margin:12px 0 4px">Position change vs prior week</p>
             ${gsc.movers
               .map(
                 (m) =>
                   `<p style="margin:4px 0;font-size:13px;color:#334155">${esc(m.query)}: ${m.prevPosition.toFixed(1)} → ${m.position.toFixed(1)} (${m.delta > 0 ? "+" : ""}${m.delta.toFixed(1)})</p>`,
               )
               .join("")}`
          : ""
      }
      <p style="font-size:11px;color:#64748B;margin:10px 0 0">${esc(gsc.mapPackNote)}</p>
    </div>`;

  const supplyHtml = p.supplyReminder
    ? `<div style="background:#F0FDFA;border:1px solid #99F6E4;border-radius:10px;padding:14px 16px;margin:20px 0 0">
        <div style="color:#0F766E;font-weight:800;font-size:13px;letter-spacing:0.04em">${esc(ui.supplyTitle)}</div>
        <p style="margin:8px 0 0;color:#134E4A;font-size:14px;line-height:1.45">${esc(p.supplyReminder)}</p>
        <p style="margin:6px 0 0;font-size:11px;color:#64748B">${esc(ui.supplyLevelNote)}</p>
      </div>`
    : "";

  const htmlLang = lang === "id" ? "id" : lang === "es" ? "es" : "en";

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:16px;padding:24px;border:1px solid #E2E8F0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;color:#0F766E">ORDERLY DAILY</div>
          <h1 style="margin:6px 0 0;font-size:22px;color:#0F172A">${esc(p.restaurantName)}</h1>
          <p style="margin:4px 0 0;color:#64748B;font-size:13px">${esc(p.reportDate)} · ${esc(p.timeZone)} · ${esc(lang.toUpperCase())}</p>
        </div>
        <div style="font-size:11px;font-weight:700;color:#0F766E;border:1px solid #99F6E4;background:#F0FDFA;border-radius:999px;padding:6px 10px">${esc(ui.verified)}</div>
      </div>

      ${urgentHtml}
      ${squareNote}

      <h2 style="font-size:15px;margin:16px 0 8px;color:#0F172A">${esc(ui.salesYesterday)}</h2>
      ${
        day
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cardHtml}</tr></table>${tipTax}`
          : `<p style="color:#64748B;font-size:14px">${esc(ui.noSquareRow(p.reportDate))}</p>`
      }

      <h2 style="font-size:15px;margin:22px 0 8px;color:#0F172A">${esc(ui.trend7d)}</h2>
      ${sparkline(p.trend7d.map((d) => d.totalSalesCents)) || `<p style="color:#64748B;font-size:13px">${esc(ui.trendNeedsSquare)}</p>`}

      <h2 style="font-size:15px;margin:22px 0 8px;color:#0F172A">${esc(ui.busiestHours)}</h2>
      ${hourBars(p.busyHours, p.peakHour, ui.noHourData)}
      ${
        p.peakHour != null
          ? `<p style="font-size:12px;color:#64748B;margin:8px 0 0">${esc(ui.peakNote)}</p>`
          : ""
      }

      <h2 style="font-size:15px;margin:22px 0 8px;color:#0F172A">${esc(ui.topProducts)}</h2>
      <p style="font-size:12px;color:#64748B;margin:0 0 8px">${esc(ui.squareWindowNote(p.squareWindow.label))}</p>
      <table width="100%" cellpadding="0" cellspacing="0">${products || `<tr><td style="color:#64748B;font-size:13px">${esc(ui.noProductMix)}</td></tr>`}</table>

      <h2 style="font-size:15px;margin:22px 0 4px;color:#0F172A">${esc(ui.onlineAttribution)}</h2>
      <p style="font-size:12px;color:#B45309;margin:0 0 8px">${esc(ui.subsetWarning)}</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr style="color:#64748B;font-size:11px;text-transform:uppercase">
          <th align="left" style="padding-bottom:6px">${esc(ui.channel)}</th>
          <th align="right" style="padding-bottom:6px">${esc(ui.orders)}</th>
          <th align="right" style="padding-bottom:6px">${esc(ui.dollars)}</th>
        </tr>
        ${channels}
      </table>
      ${anomalyHtml}

      <h2 style="font-size:15px;margin:22px 0 8px;color:#0F172A">${esc(ui.reputation)}</h2>
      <p style="font-size:13px;color:#334155;margin:0">${esc(reputationSummary)}</p>
      ${praiseHtml}

      ${gscHtml}

      <h2 style="font-size:15px;margin:22px 0 8px;color:#0F172A">${esc(ui.insights)}</h2>
      <ul style="padding-left:18px;margin:0">${insights}</ul>

      ${
        p.narrative.body
          ? `<div style="margin:22px 0 0;padding-top:16px;border-top:1px solid #E2E8F0">
              <div style="font-size:12px;font-weight:800;letter-spacing:0.04em;color:#0F766E;margin-bottom:8px">${esc(ui.managerNote)}</div>
              <p style="margin:0 0 8px;font-size:14px;color:#0F172A;font-weight:600">${esc(p.narrative.greeting)}</p>
              ${paragraphsHtml(p.narrative.body)}
            </div>`
          : ""
      }

      ${
        p.narrative.ideaForToday
          ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px 16px;margin:16px 0 0">
              <div style="color:#92400E;font-weight:800;font-size:12px;letter-spacing:0.04em">${esc(ui.oneIdea)}</div>
              <p style="margin:8px 0 0;color:#78350F;font-size:14px;line-height:1.45">${esc(p.narrative.ideaForToday)}</p>
            </div>`
          : ""
      }

      ${supplyHtml}

      <p style="margin:24px 0 0;font-size:11px;color:#94A3B8;line-height:1.5">
        ${esc(p.disclaimer)} · ${esc(ui.verified)}.
        ${p.narrative.source === "ai" ? ` · ${esc(ui.narrativeAi)}` : ` · ${esc(ui.narrativeFacts)}`}
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function renderDailyReportSubject(p: DailyReportPayload): string {
  const locale = langLocale(p.language || "en");
  const total = p.day ? money(p.day.totalSalesCents, locale) : "update";
  const tag =
    p.language === "id" ? "ID" : p.language === "es" ? "ES" : "EN";
  return `${p.restaurantName} · ${p.reportDate} · ${total} · ${tag}`;
}
