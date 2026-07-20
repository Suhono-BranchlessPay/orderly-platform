-- Backfill is_test on orders whose src matches ops test/probe patterns,
-- plus known smoke IDs that used real campaign src (ig-bio) but were ops tests.
-- Safe to re-run.

UPDATE orders
SET source_detail = jsonb_set(
  jsonb_set(
    COALESCE(source_detail, '{}'::jsonb),
    '{is_test}',
    'true'::jsonb,
    true
  ),
  '{test_reason}',
  to_jsonb(
    COALESCE(
      NULLIF(source_detail->>'test_reason', ''),
      CASE
        WHEN id::text LIKE '72edd5d4%' OR id::text LIKE '009994bf%'
          THEN 'manual_ops_smoke_backfill'
        ELSE 'auto_src_test_pattern_backfill'
      END
    )
  ),
  true
)
WHERE COALESCE((source_detail->>'is_test')::boolean, false) = false
  AND (
    id::text LIKE '72edd5d4%'
    OR id::text LIKE '009994bf%'
    OR lower(COALESCE(source_detail->>'src', '')) ~ '(^|-)test($|-)'
    OR lower(COALESCE(source_detail->>'src', '')) LIKE '%probe%'
    OR lower(COALESCE(source_detail->>'src', '')) LIKE 'test-%'
    OR lower(COALESCE(source_detail->>'src', '')) LIKE 'probe-%'
    OR lower(COALESCE(source_detail->>'src', '')) IN ('test', 'test-manual', 'probe', 'probe-redirect')
  );

SELECT left(id::text, 8) AS id8,
  source_detail->>'src' AS src,
  source_detail->>'is_test' AS is_test,
  source_detail->>'test_reason' AS test_reason
FROM orders
WHERE (source_detail->>'is_test')::boolean = true
ORDER BY created_at DESC
LIMIT 30;
