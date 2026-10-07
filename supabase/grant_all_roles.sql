-- ============================================================================
-- ServiceFlow — give one person every role, in every hotel of every organisation.
--
-- For the founder's own account: one sign-in that can "View as" any role
-- (GM, chef, housekeeping, engineering, set-up, owner, VP, CEO) without
-- signing out. Run in the Supabase SQL editor (it runs as the database owner,
-- which is the only place portfolio and admin roles may be granted).
--
-- Change the e-mail on the next line, then run. Safe to run twice.
-- If the account does not exist yet, the memberships wait for it and attach
-- themselves when it is created (see sf_handle_new_auth_user).
-- ============================================================================

WITH who AS (SELECT lower('jergoug@yahoo.com') AS email),
     usr AS (SELECT u.id FROM public.users u, who WHERE lower(u.email) = who.email),
     roles AS (SELECT unnest(ARRAY['gm','fnb_mgr','chef','sous_chef','prep_cook','hk','eng','auditor','admin','owner','vp','ceo']) AS role)
INSERT INTO memberships (user_id, invited_email, scope_type, org_id, role)
SELECT (SELECT id FROM usr), who.email, 'org', o.id, r.role
FROM orgs o CROSS JOIN roles r CROSS JOIN who
WHERE NOT EXISTS (
  SELECT 1 FROM memberships m
  WHERE m.org_id = o.id AND m.scope_type = 'org' AND m.role = r.role AND m.active
    AND (m.user_id = (SELECT id FROM usr) OR lower(m.invited_email) = who.email)
);

-- Check: one line per organisation and role.
SELECT o.name AS organisation, m.role, m.user_id IS NOT NULL AS account_attached
FROM memberships m JOIN orgs o ON o.id = m.org_id
WHERE lower(m.invited_email) = lower('jergoug@yahoo.com')
   OR m.user_id IN (SELECT id FROM public.users WHERE lower(email) = lower('jergoug@yahoo.com'))
ORDER BY o.name, m.role;
