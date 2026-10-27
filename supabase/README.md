# Supabase (accounts)

Project: `zveqsvizefgbicwvjvdu` (https://zveqsvizefgbicwvjvdu.supabase.co). The files in
`migrations/` are already applied to it; their version numbers match the project's migration
history, so the GitHub integration will not run them again.

## Roles
| Role | Who | How it is assigned |
|---|---|---|
| `admin` | CarvCAM team | The account's e-mail is in `public.admin_allowlist` (seeded with `lecfmpp@gmail.com`) |
| `customer` | Everyone else | Default for every new account |

- `public.profiles` holds one row per account (`id`, `email`, `full_name`, `role`), created by a
  trigger on `auth.users`.
- RLS: a customer reads and updates only their own row and may change only `full_name`. An admin
  reads and updates every row. Only an admin (or the service role) can change a role.
- `private.is_admin()` is the admin check used by the policies; it is not exposed through the API.
- `public.custom_access_token_hook` adds a `user_role` claim to the login token.

## One-time dashboard steps
1. **Authentication › Hooks › Customize Access Token (JWT) Claims**: enable it and choose
   `public.custom_access_token_hook`.
2. **Authentication › Users › Add user** with `lecfmpp@gmail.com` (or sign up from the app later):
   the account gets the `admin` role automatically.

## Adding another admin
```sql
insert into public.admin_allowlist (email) values ('someone@example.com');
-- for an account that already exists:
update public.profiles set role = 'admin' where email = 'someone@example.com';
```
