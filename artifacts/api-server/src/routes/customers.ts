import { Router } from "express";
import { db } from "@workspace/db";
import {
  customersTable,
  ordersTable,
  orderLinesTable,
  addressesTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { checkPin } from "../lib/ownerAuth";
import { getTenantId } from "../lib/tenant";
import { normalizeEmail, normalizePhoneE164 } from "../lib/phone";

const router = Router();

function requestTenantId(req: { tenant?: { id: string } }): string {
  return req.tenant?.id ?? getTenantId();
}

const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().nullable().optional(),
  phone: z.string().min(7),
  email: z.string().email().nullable().optional(),
});

/* POST /api/customers — voluntary registration (owner marketing list) */
router.post("/customers", async (req, res): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
    return;
  }

  const tenantId = requestTenantId(req);
  const phone = normalizePhoneE164(parsed.data.phone);
  const email = normalizeEmail(parsed.data.email);

  try {
    const existing = await db
      .select()
      .from(customersTable)
      .where(
        and(
          eq(customersTable.tenantId, tenantId),
          eq(customersTable.phone, phone),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Phone already registered", customer: existing[0] });
      return;
    }

    const [customer] = await db
      .insert(customersTable)
      .values({
        id: randomUUID(),
        tenantId,
        firstName: parsed.data.firstName.trim(),
        lastName: parsed.data.lastName?.trim() || null,
        phone,
        email,
      })
      .returning();

    res.status(201).json({ customer });
  } catch (err) {
    req.log.error({ err }, "Customer registration failed");
    res.status(500).json({ error: "Registration failed" });
  }
});

/* GET /api/customers?phone= — disabled: no unauthenticated PII lookup */
router.get("/customers", async (_req, res): Promise<void> => {
  res.status(403).json({
    error:
      "Customer lookup by phone is not available. Your saved details appear automatically on this device at checkout.",
  });
});

router.get("/owner/customers", async (req, res): Promise<void> => {
  if (!(await checkPin(req.query.pin))) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  const tenantId = requestTenantId(req);

  try {
    const customers = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.tenantId, tenantId))
      .orderBy(desc(customersTable.createdAt));

    const withStats = await Promise.all(
      customers.map(async (c) => {
        const orders = await db
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.customerId, c.id));
        const totalOrders = orders.length;
        const totalSpent = orders.reduce((s, o) => s + o.total, 0);
        const defaultAddress = await db
          .select()
          .from(addressesTable)
          .where(
            and(
              eq(addressesTable.customerId, c.id),
              eq(addressesTable.isDefault, true),
            ),
          )
          .limit(1);
        return {
          ...c,
          name: [c.firstName, c.lastName].filter(Boolean).join(" "),
          city: defaultAddress[0]?.city ?? "",
          createdAt: c.createdAt?.toISOString(),
          totalOrders,
          totalSpent,
        };
      }),
    );

    res.json({ customers: withStats, total: withStats.length });
  } catch (err) {
    req.log.error({ err }, "Owner customers list failed");
    res.status(500).json({ error: "Failed to load customers" });
  }
});

router.get("/owner/customers/export", async (req, res): Promise<void> => {
  if (!(await checkPin(req.query.pin))) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  const tenantId = requestTenantId(req);

  try {
    const customers = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.tenantId, tenantId))
      .orderBy(desc(customersTable.createdAt));

    const rows = await Promise.all(
      customers.map(async (c) => {
        const orders = await db
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.customerId, c.id));
        const defaultAddress = await db
          .select()
          .from(addressesTable)
          .where(
            and(
              eq(addressesTable.customerId, c.id),
              eq(addressesTable.isDefault, true),
            ),
          )
          .limit(1);
        return {
          ...c,
          name: [c.firstName, c.lastName].filter(Boolean).join(" "),
          city: defaultAddress[0]?.city ?? "",
          totalOrders: orders.length,
          totalSpent: orders.reduce((s, o) => s + o.total, 0),
        };
      }),
    );

    const escape = (v: string | number | null | undefined) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const header = [
      "First Name",
      "Last Name",
      "Phone",
      "Email",
      "City",
      "Registered",
      "Total Orders",
      "Total Spent ($)",
    ];
    const lines = rows.map((r) =>
      [
        escape(r.firstName),
        escape(r.lastName),
        escape(r.phone),
        escape(r.email),
        escape(r.city),
        escape(
          r.createdAt
            ? new Date(r.createdAt).toLocaleDateString("en-US")
            : "",
        ),
        escape(r.totalOrders),
        escape(r.totalSpent.toFixed(2)),
      ].join(","),
    );

    const csv = [header.join(","), ...lines].join("\r\n");
    const filename = `orderly-customers-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  } catch (err) {
    req.log.error({ err }, "Customer export failed");
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
