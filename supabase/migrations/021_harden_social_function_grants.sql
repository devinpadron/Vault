-- Reduce RPC surface of the SECURITY DEFINER functions added in 020.
-- are_friends is referenced by activity_events RLS, so the authenticated role
-- must keep EXECUTE; anon never needs it. emit_card_added_activity is only ever
-- fired by its trigger (as owner), so no role needs direct EXECUTE.

revoke execute on function are_friends(uuid, uuid) from anon;
revoke execute on function emit_card_added_activity() from anon, authenticated;
