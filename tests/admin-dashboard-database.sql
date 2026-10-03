begin;

do $$
declare
    test_invitation_id uuid := gen_random_uuid();
    invitation_hash text := encode(sha256(gen_random_uuid()::text::bytea), 'hex');
    deletion_result jsonb;
begin
    if has_function_privilege('anon', 'public.delete_personal_invitation(uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.delete_personal_invitation(uuid)', 'EXECUTE') then
        raise exception 'Public deletion must be denied';
    end if;
    if not has_function_privilege('service_role', 'public.delete_personal_invitation(uuid)', 'EXECUTE') then
        raise exception 'Backend deletion must be allowed';
    end if;
    if has_column_privilege('anon', 'public.rsvp_responses', 'first_name', 'SELECT')
       or has_column_privilege('authenticated', 'public.rsvp_responses', 'first_name', 'SELECT') then
        raise exception 'Public dashboard access must be denied';
    end if;
    insert into public.rsvp_invitations (id, first_name, last_name, token_hash)
        values (test_invitation_id, 'Test', 'Dashboard', invitation_hash);
    insert into public.rsvp_responses (id, first_name, last_name, attending, invitation_id)
        values (gen_random_uuid(), 'Test', 'Dashboard', true, test_invitation_id);
    deletion_result := public.delete_personal_invitation(test_invitation_id);
    if deletion_result->>'ok' <> 'true'
       or exists (select 1 from public.rsvp_invitations where id=test_invitation_id)
       or exists (select 1 from public.rsvp_responses as response where response.invitation_id=test_invitation_id) then
        raise exception 'Deletion must remove both invitation and response';
    end if;
    if public.delete_personal_invitation(test_invitation_id)->>'ok' <> 'true' then
        raise exception 'Deletion retry must be idempotent';
    end if;
    if public.submit_personal_rsvp(invitation_hash, gen_random_uuid(), true)->>'code' <> 'invitation_invalid' then
        raise exception 'Deleted token must not submit a new RSVP';
    end if;
end $$;

rollback;
select 'Dashboard privileges, atomic deletion, retry and deleted-token rejection verified' as result;
