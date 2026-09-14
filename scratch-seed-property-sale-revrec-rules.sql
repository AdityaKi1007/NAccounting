-- Seeds the 5 property-sale Revenue Recognition rules for NeoProp Technologies.
-- Idempotent: skips any rule whose name already exists for this org, safe to re-run.
-- Prerequisite: migration 1782000000000_revenue_recognition.js must already be applied
-- (i.e. the revenue_recognition_rules table must exist) -- run `npm run migrate:up` first.
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE name = 'NeoProp Technologies';
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'NeoProp Technologies organization not found';
  END IF;

  INSERT INTO revenue_recognition_rules (organization_id, name, method, frequency, description, is_active)
  SELECT v_org_id, x.name, x.method, x.frequency, x.description, true
  FROM (VALUES
    ('Ready Unit Sale', 'immediate', 'monthly',
     'For completed/ready units. Recognizes the full sale amount immediately on the invoice date. Time the invoice to actual handover/title transfer, not booking, so revenue lands on the date control genuinely passes to the buyer. Leave Service Start/End Date blank on the invoice line.'),
    ('Off-Plan Construction (Straight-Line)', 'straight_line', 'monthly',
     'For off-plan units where revenue is spread over the construction period as an approximation of percentage-of-completion. On the invoice line, set Service Start Date = booking/sale date and Service End Date = expected handover date (see the unit''s Project > Estimated Completion Date). Revenue releases evenly, month by month, until handover. Note: this is a calendar-day approximation, not true cost-based POC.'),
    ('Off-Plan – Recognize at Handover Only', 'straight_line', 'monthly',
     'For off-plan units where you want ALL revenue held as Deferred Revenue until handover, with nothing recognized early. Set both Service Start Date and Service End Date on the invoice line to the same single day: the expected handover date. The full amount releases to Income on that one date, not before.'),
    ('Property Management / Service Fees', 'straight_line', 'monthly',
     'For recurring, non-sale revenue such as property management fees, service charges, or maintenance contracts. Set Service Start/End Date on the invoice line to the real contract period; revenue releases evenly month by month across it.'),
    ('Brokerage Commission', 'immediate', 'monthly',
     'For commission income earned on a brokered sale, recognized in full at deal closure regardless of how the underlying property sale itself is recognized. Leave Service Start/End Date blank.')
  ) AS x(name, method, frequency, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM revenue_recognition_rules r WHERE r.organization_id = v_org_id AND r.name = x.name
  );
END $$;

SELECT name, method, frequency, is_active FROM revenue_recognition_rules
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'NeoProp Technologies')
ORDER BY created_at;
