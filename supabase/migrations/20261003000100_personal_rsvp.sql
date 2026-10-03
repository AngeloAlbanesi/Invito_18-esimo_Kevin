begin;

create table public.rsvp_invitations (
    id uuid primary key,
    first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
    last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
    token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
    revoked_at timestamptz,
    window_started_at timestamptz not null default now(),
    attempts integer not null default 0 check (attempts between 0 and 5)
);
alter table public.rsvp_invitations enable row level security;
revoke all on public.rsvp_invitations from public, anon, authenticated;
grant select, insert, update on public.rsvp_invitations to service_role;

alter table public.rsvp_responses
    add column invitation_id uuid references public.rsvp_invitations(id),
    add constraint rsvp_responses_invitation_unique unique (invitation_id);

create function public.submit_personal_rsvp(
    token_hash text, request_id uuid, attending boolean,
    allergies text default null, allergy_consent boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    invitation public.rsvp_invitations%rowtype;
    existing_response public.rsvp_responses%rowtype;
    current_limit public.rsvp_rate_limit%rowtype;
    remaining_seconds integer;
begin
    if request_id is null or attending is null or allergy_consent is null
       or request_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or (allergies is not null and (
           char_length(allergies) not between 1 and 1000 or not attending or not allergy_consent
       )) then
        return jsonb_build_object('code', 'invalid_input');
    end if;
    if clock_timestamp() >= timestamptz '2026-11-16 00:00:00+01' then
        return jsonb_build_object('code', 'rsvp_closed');
    end if;
    select * into invitation from public.rsvp_invitations as invitation_row
     where invitation_row.token_hash = submit_personal_rsvp.token_hash for update;
    if not found or invitation.revoked_at is not null then
        return jsonb_build_object('code', 'invitation_invalid');
    end if;
    if clock_timestamp() >= invitation.window_started_at + interval '1 minute' then
        invitation.window_started_at := clock_timestamp();
        invitation.attempts := 0;
    end if;
    if invitation.attempts >= 5 then
        remaining_seconds := greatest(1, ceil(extract(epoch from
            invitation.window_started_at + interval '1 minute' - clock_timestamp()))::integer);
        return jsonb_build_object('code', 'rate_limit', 'retry_after', remaining_seconds);
    end if;
    update public.rsvp_invitations as invitation_row
       set attempts = invitation.attempts + 1, window_started_at = invitation.window_started_at
     where invitation_row.id = invitation.id;

    -- Return rejection results instead of raising: the attempt counter must commit.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text, 0));
    select * into existing_response from public.rsvp_responses as response_row
     where response_row.id = request_id;
    if found then
        if existing_response.invitation_id = invitation.id
           and existing_response.attending = attending
           and existing_response.allergies is not distinct from allergies
           and existing_response.allergy_consent = allergy_consent then
            return jsonb_build_object('code', 'ok');
        end if;
        return jsonb_build_object('code', 'request_conflict');
    end if;
    if exists (select 1 from public.rsvp_responses as response_row
               where response_row.invitation_id = invitation.id) then
        return jsonb_build_object('code', 'invitation_used');
    end if;

    select * into current_limit from public.rsvp_rate_limit where id = true for update;
    if clock_timestamp() >= current_limit.window_started_at + interval '1 minute' then
        update public.rsvp_rate_limit
           set window_started_at = clock_timestamp(), submissions = 0 where id = true;
        current_limit.submissions := 0;
    end if;
    if current_limit.submissions >= 60 then
        remaining_seconds := greatest(1, ceil(extract(epoch from
            current_limit.window_started_at + interval '1 minute' - clock_timestamp()))::integer);
        return jsonb_build_object('code', 'rate_limit', 'retry_after', remaining_seconds);
    end if;
    update public.rsvp_rate_limit set submissions = submissions + 1 where id = true;
    insert into public.rsvp_responses
        (id, invitation_id, first_name, last_name, attending, allergies, allergy_consent)
    values
        (request_id, invitation.id, invitation.first_name, invitation.last_name,
         attending, allergies, allergy_consent);
    return jsonb_build_object('code', 'ok');
end;
$$;
revoke all on function public.submit_personal_rsvp(text, uuid, boolean, text, boolean)
    from public, anon, authenticated;
grant execute on function public.submit_personal_rsvp(text, uuid, boolean, text, boolean)
    to service_role;

commit;
