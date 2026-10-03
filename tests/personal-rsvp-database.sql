begin;
do $$
declare
    first_invitation uuid := gen_random_uuid();
    second_invitation uuid := gen_random_uuid();
    third_invitation uuid := gen_random_uuid();
    first_request uuid := gen_random_uuid();
    second_request uuid := gen_random_uuid();
    role_name text;
    operation text;
    result jsonb;
    submissions_before integer;
begin
    assert to_regprocedure('public.submit_rsvp(uuid,text,text,boolean,text,boolean)') is null,
        'Legacy insertion procedure remains active';
    foreach role_name in array array['anon', 'authenticated'] loop
        foreach operation in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
            assert not has_table_privilege(role_name, 'public.rsvp_invitations', operation);
            assert not has_table_privilege(role_name, 'public.rsvp_responses', operation);
            assert not has_table_privilege(role_name, 'public.rsvp_rate_limit', operation);
        end loop;
        assert not has_function_privilege(role_name,
            'public.submit_personal_rsvp(text,uuid,boolean,text,boolean)', 'EXECUTE');
    end loop;
    assert (select relrowsecurity from pg_class where oid = 'public.rsvp_invitations'::regclass);
    insert into public.rsvp_invitations(id, first_name, last_name, token_hash) values
        (first_invitation, 'Audit', 'First', repeat('a', 64)),
        (second_invitation, 'Audit', 'Second', repeat('b', 64)),
        (third_invitation, 'Audit', 'Third', repeat('c', 64));
    update public.rsvp_rate_limit set submissions=0, window_started_at=clock_timestamp() where id=true;
    result := public.submit_personal_rsvp(repeat('a', 64), first_request, true);
    assert result->>'code' = 'ok';
    assert (select first_name='Audit' and last_name='First' and invitation_id=first_invitation
            from public.rsvp_responses where id=first_request);
    result := public.submit_personal_rsvp(repeat('a', 64), first_request, true);
    assert result->>'code' = 'ok';
    assert (select submissions=1 from public.rsvp_rate_limit where id=true), 'Retry consumed global capacity';
    result := public.submit_personal_rsvp(repeat('a', 64), first_request, false);
    assert result->>'code' = 'request_conflict';
    assert (select attempts=3 from public.rsvp_invitations where id=first_invitation), 'Conflict counter rolled back';
    result := public.submit_personal_rsvp(repeat('a', 64), gen_random_uuid(), true);
    assert result->>'code' = 'invitation_used';
    result := public.submit_personal_rsvp(repeat('a', 64), first_request, true);
    assert result->>'code' = 'ok';
    result := public.submit_personal_rsvp(repeat('a', 64), first_request, true);
    assert result->>'code' = 'rate_limit' and (result->>'retry_after')::integer between 1 and 60;
    result := public.submit_personal_rsvp(repeat('b', 64), first_request, true);
    assert result->>'code' = 'request_conflict', 'Cross-invitation retry accepted';
    result := public.submit_personal_rsvp(repeat('b', 64), second_request, true, 'Fictional', true);
    assert result->>'code' = 'ok', 'Other invitation blocked by first invitation limit';
    update public.rsvp_invitations set revoked_at=now() where id=second_invitation;
    result := public.submit_personal_rsvp(repeat('b', 64), second_request, true, 'Fictional', true);
    assert result->>'code' = 'invitation_invalid';
    update public.rsvp_invitations set token_hash=repeat('d',64), revoked_at=null where id=second_invitation;
    result := public.submit_personal_rsvp(repeat('b', 64), second_request, true, 'Fictional', true);
    assert result->>'code' = 'invitation_invalid';
    result := public.submit_personal_rsvp(repeat('d', 64), gen_random_uuid(), true);
    assert result->>'code' = 'invitation_used', 'Rotation unlocked a saved reply';
    result := public.submit_personal_rsvp(repeat('e', 64), gen_random_uuid(), true);
    assert result->>'code' = 'invitation_invalid';
    result := public.submit_personal_rsvp(repeat('c', 64), gen_random_uuid(), true, 'No consent', false);
    assert result->>'code' = 'invalid_input';
    update public.rsvp_rate_limit set submissions=60, window_started_at=clock_timestamp() where id=true;
    result := public.submit_personal_rsvp(repeat('c', 64), gen_random_uuid(), true);
    assert result->>'code' = 'rate_limit';
    assert (select attempts=1 from public.rsvp_invitations where id=third_invitation), 'Global rejection counter rolled back';
    update public.rsvp_rate_limit set window_started_at=clock_timestamp()-interval '61 seconds' where id=true;
    result := public.submit_personal_rsvp(repeat('c', 64), gen_random_uuid(), true);
    assert result->>'code' = 'ok';
    assert (select submissions=1 from public.rsvp_rate_limit where id=true);
    assert (select count(*)=3 from public.rsvp_responses where invitation_id in
        (first_invitation,second_invitation,third_invitation));
end;
$$;
select 'Personal RSVP: permissions, names, counters, retries, revocation, rotation and limits OK' as result;
rollback;
