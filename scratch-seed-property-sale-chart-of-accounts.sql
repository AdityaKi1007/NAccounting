-- Real-estate Chart of Accounts additions for NeoProp Technologies.
-- Idempotent: the renames are no-ops if already applied (matched by code); the inserts skip
-- any code that already exists for this org. Safe to re-run.
-- Prerequisite: none beyond the base schema -- these are plain `accounts` rows, no migration
-- needed (the table and its `type` values already exist).
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE name = 'NeoProp Technologies';
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'NeoProp Technologies organization not found';
  END IF;

  -- Renames (by code, preserves the account's id so historical journal_lines / reports still
  -- resolve correctly -- confirmed the invoice-posting engine's default income lookup, which
  -- matches on `name ILIKE '%sales%'`, still finds "Property Sales Revenue").
  UPDATE accounts SET name = 'Property Sales Revenue' WHERE organization_id = v_org_id AND code = '4000' AND name = 'Sales Income';
  UPDATE accounts SET name = 'Cost of Units Sold' WHERE organization_id = v_org_id AND code = '5000' AND name = 'Cost of Goods Sold';

  INSERT INTO accounts (organization_id, code, name, type, description, is_active)
  SELECT v_org_id, x.code, x.name, x.type, x.description, true
  FROM (VALUES
    ('1030', 'Land Inventory', 'stock', 'Land held for future development or resale, at cost.'),
    ('1040', 'Construction Work in Progress', 'capital_work_in_progress', 'Accumulated construction cost for off-plan units not yet complete. Transfer to Completed Units Held for Sale (or to Cost of Units Sold, at the point of sale) via manual journal as units complete.'),
    ('1050', 'Completed Units Held for Sale', 'stock', 'Cost basis of completed, unsold units -- the inventory that becomes Cost of Units Sold when a unit sells.'),
    ('2050', 'Retention Payable', 'other_current_liability', 'Amounts withheld from contractor/subcontractor bills pending the defect liability period.'),
    ('4020', 'Property Management Income', 'income', 'Management fees / service charge income. Note: invoice income always posts to whichever account matches the app''s default "sales" lookup (Property Sales Revenue) -- recognize this income via a manual journal, or ask for per-line income account selection to be built if you want invoices to route here automatically.'),
    ('4030', 'Brokerage Commission Income', 'income', 'Commission earned on brokered sales. Same automatic-posting note as Property Management Income above -- currently manual-journal only.')
  ) AS x(code, name, type, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.organization_id = v_org_id AND a.code = x.code
  );
END $$;

SELECT code, name, type FROM accounts
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'NeoProp Technologies')
ORDER BY code NULLS LAST;
