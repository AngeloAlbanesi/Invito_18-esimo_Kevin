begin;

grant select (invitation_id, first_name, last_name, created_at, attending)
    on public.rsvp_responses to service_role;

create function public.delete_personal_invitation(invitation_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
    if invitation_id is null then
        raise exception using errcode = '22023', message = 'invalid_invitation';
    end if;
    -- Use the same invitation lock as submission to serialize deletion and RSVP.
    perform 1 from public.rsvp_invitations as invitation
        where invitation.id = delete_personal_invitation.invitation_id for update;
    delete from public.rsvp_responses as response
        where response.invitation_id = delete_personal_invitation.invitation_id;
    delete from public.rsvp_invitations as invitation
        where invitation.id = delete_personal_invitation.invitation_id;
    return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_personal_invitation(uuid) from public, anon, authenticated;
grant execute on function public.delete_personal_invitation(uuid) to service_role;

commit;
