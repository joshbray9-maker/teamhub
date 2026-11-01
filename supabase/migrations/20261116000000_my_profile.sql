-- My Profile: a name, staff title, phone, bio and photo for each person. People who share an
-- organization can see each other's profile (as before); each person edits only their own, and
-- never their email (that comes from sign-in).
alter table public.profiles
  add column display_name text not null default '',
  add column title text not null default '',
  add column phone text not null default '',
  add column bio text not null default '',
  add column photo text;   -- path in the private 'avatars' bucket: <user_id>/<file>

create policy prof_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name, title, phone, bio, photo) on public.profiles to authenticated;

-- chat shows the sender's name once they've set one
create or replace function public.chat_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.author := coalesce((select coalesce(nullif(btrim(display_name), ''), email) from profiles where id = auth.uid()), '');
  new.created_at := now();
  new.body := btrim(new.body);
  return new;
end $$;

-- profile photos: you write your own folder; people in your organizations can read it
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false) on conflict (id) do nothing;
create policy avatars_read on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
               where a.user_id = auth.uid() and b.user_id::text = (storage.foldername(name))[1])));
create policy avatars_write on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
