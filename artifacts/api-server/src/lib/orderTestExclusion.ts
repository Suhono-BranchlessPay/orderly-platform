import { sql, type SQL } from "drizzle-orm";
import { ordersTable } from "@workspace/db";
import { isOpsTestSrc, withOpsTestSourceDetail } from "./opsTestSrc";

export { isOpsTestSrc, withOpsTestSourceDetail };

/**
 * Ops / QA paid orders that must not train Content Engine or inflate
 * calendar / social closed-loop metrics (same class as DQ attribution window).
 *
 * Mark via source_detail.is_test = true (boolean JSON), or match src patterns
 * (test-*, *-test, *probe*). Create path also auto-sets is_test via
 * withOpsTestSourceDetail().
 */
export function sqlExcludeOpsTestOrders(): SQL {
  return sql`(
    coalesce((${ordersTable.sourceDetail}->>'is_test')::boolean, false) = false
    AND lower(coalesce(${ordersTable.sourceDetail}->>'test','')) NOT IN ('1','true','yes')
    AND lower(coalesce(${ordersTable.sourceDetail}->>'src','')) NOT LIKE 'test-%'
    AND lower(coalesce(${ordersTable.sourceDetail}->>'src','')) <> 'test-manual'
    AND lower(coalesce(${ordersTable.sourceDetail}->>'src','')) NOT LIKE '%probe%'
    AND lower(coalesce(${ordersTable.sourceDetail}->>'src','')) NOT LIKE '%-test'
    AND lower(coalesce(${ordersTable.sourceDetail}->>'src','')) NOT LIKE '%-test-%'
  )`;
}
