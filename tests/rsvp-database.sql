begin;

do $$
declare
    test_id uuid := gen_random_uuid();
    visitor_role text;
    operation text;
begin
    foreach visitor_role in array array['anon', 'authenticated'] loop
        foreach operation in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
            assert not has_table_privilege(visitor_role, 'public.rsvp_responses', operation),
                'Visitor has access to replies';
            assert not has_table_privilege(visitor_role, 'public.rsvp_rate_limit', operation),
                'Visitor has access to rate limit';
        end loop;
        assert not has_function_privilege(
            visitor_role, 'public.submit_rsvp(uuid,text,text,boolean,text,boolean)', 'EXECUTE'
        ), 'Visitor can bypass the endpoint';
    end loop;
    assert (select relrowsecurity from pg_class where oid = 'public.rsvp_responses'::regclass),
        'RLS is disabled';

    perform public.submit_rsvp(test_id, 'Test', 'Database', true);
    perform public.submit_rsvp(test_id, 'Test', 'Database', true);
    assert (select count(*) = 1 from public.rsvp_responses where id = test_id),
        'Retry created duplicate replies';

    begin
        perform public.submit_rsvp(test_id, 'Changed', 'Database', true);
        raise exception 'Conflicting retry was accepted';
    exception when unique_violation then
        null;
    end;

    begin
        perform public.submit_rsvp(gen_random_uuid(), '', 'Database', true);
        raise exception 'Invalid name was accepted';
    exception when invalid_parameter_value then
        null;
    end;

    begin
        perform public.submit_rsvp(gen_random_uuid(), 'Test', 'Database', true, 'Fictional', false);
        raise exception 'Allergies without consent were accepted';
    exception when invalid_parameter_value then
        null;
    end;

    update public.rsvp_rate_limit set submissions = 60, window_started_at = now() where id = true;
    begin
        perform public.submit_rsvp(gen_random_uuid(), 'Test', 'Database', true);
        raise exception 'Rate limit was bypassed';
    exception when raise_exception then
        if sqlerrm <> 'rate_limit' then
            raise;
        end if;
    end;
end;
$$;

rollback;
