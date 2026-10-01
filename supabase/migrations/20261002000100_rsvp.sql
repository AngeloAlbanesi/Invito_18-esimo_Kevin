begin;

create table public.rsvp_responses (
    id uuid primary key,
    created_at timestamptz not null default now(),
    first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
    last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
    attending boolean not null,
    allergies text check (char_length(allergies) between 1 and 1000),
    allergy_consent boolean not null default false,
    check (allergies is null or (attending and allergy_consent))
);

create table public.rsvp_rate_limit (
    id boolean primary key default true check (id),
    window_started_at timestamptz not null default now(),
    submissions integer not null default 0
);

insert into public.rsvp_rate_limit (id) values (true);

alter table public.rsvp_responses enable row level security;
alter table public.rsvp_rate_limit enable row level security;
revoke all on public.rsvp_responses, public.rsvp_rate_limit from public, anon, authenticated;

create function public.submit_rsvp(
    request_id uuid,
    first_name text,
    last_name text,
    attending boolean,
    allergies text default null,
    allergy_consent boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    existing_response public.rsvp_responses%rowtype;
    current_limit public.rsvp_rate_limit%rowtype;
begin
    if request_id is null or first_name is null or last_name is null
       or attending is null or allergy_consent is null
       or char_length(btrim(first_name)) not between 1 and 80
       or char_length(btrim(last_name)) not between 1 and 80
       or (allergies is not null and (
           char_length(allergies) not between 1 and 1000
           or not attending or not allergy_consent
       )) then
        raise exception using errcode = '22023', message = 'invalid_input';
    end if;

    -- Serialize retries for the same request before checking its stored payload.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text, 0));
    select * into existing_response
      from public.rsvp_responses where id = request_id;

    if found then
        if existing_response.first_name = btrim(first_name)
           and existing_response.last_name = btrim(last_name)
           and existing_response.attending = attending
           and existing_response.allergies is not distinct from allergies
           and existing_response.allergy_consent = allergy_consent then
            return;
        end if;
        raise exception using errcode = '23505', message = 'request_conflict';
    end if;

    -- ponytail: global limit of 60 new replies per minute; add per-client limits if traffic grows.
    select * into current_limit from public.rsvp_rate_limit where id = true for update;
    if clock_timestamp() >= current_limit.window_started_at + interval '1 minute' then
        update public.rsvp_rate_limit
           set window_started_at = clock_timestamp(), submissions = 0 where id = true;
        current_limit.submissions := 0;
    end if;
    if current_limit.submissions >= 60 then
        raise exception using errcode = 'P0001', message = 'rate_limit';
    end if;
    update public.rsvp_rate_limit set submissions = submissions + 1 where id = true;

    insert into public.rsvp_responses
        (id, first_name, last_name, attending, allergies, allergy_consent)
    values
        (request_id, btrim(first_name), btrim(last_name), attending, allergies, allergy_consent);
end;
$$;

revoke all on function public.submit_rsvp(uuid, text, text, boolean, text, boolean)
    from public, anon, authenticated;
grant execute on function public.submit_rsvp(uuid, text, text, boolean, text, boolean)
    to service_role;

commit;
