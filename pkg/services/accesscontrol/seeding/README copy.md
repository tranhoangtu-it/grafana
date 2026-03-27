# RBAC Seeding — Permission & Role Lifecycle Guide

This document covers recurring problems caused by renaming, removing, or restructuring
fixed roles and plugin roles (and their permissions). It applies to anyone modifying
role registrations (e.g. in `pkg/services/accesscontrol/roles.go`), plugin role
declarations, basically anywhere `RoleRegistration` structs are built.

## TL;DR

Never remove or rename a permission/role in one shot. It breaks custom roles and
Terraform.

| Change | Do | Don't |
|---|---|---|
| Rename a permission | Add new action alongside old; stop checking old in code; remove old after 1 major | Replace the action string in the role |
| Remove a permission | Stop checking in code; keep in role; remove after 1 major | Delete from role registration immediately |
| Remove a role | Empty permissions (if still granted elsewhere) + set display name to "(Deprecated) …"; remove after 1 major | Delete the registration |
| Rename a role (`Name`) | Change `DisplayName` only, or deprecate old + create new | Change the `Name` string |

**Why:** The role update API requires the caller to hold every permission in the role.
If a permission no longer exists anywhere, no one holds it, and any custom role
containing it becomes locked (403 on any update). The seeder treats new action strings
as additions, which silently re-grants permissions to basic roles even when an admin had
revoked the old name (see Known limitation in Problem 1). Removed roles cascade-delete
all assignments, breaking Terraform references.

---

## Background: how seeding works

On every Grafana startup the `Seeder` reconciles the desired state (role registrations
declared in code) against the persisted state (database). Specifically:

- **Roles** are matched by `Name` (e.g. `fixed:dashboards:reader`). If a role exists in
  code but not in the DB it is created. If the permissions differ, they are overwritten.
  If a role exists in the DB but is no longer registered, `RemoveAbsentRoles` deletes it
  **along with all of its assignments** (`user_role`, `team_role`, `builtin_role`).

- **Basic-role permissions** (the permissions granted to Viewer/Editor/Admin via
  `Grants`) are reconciled by `Seed()` which diffs the desired set against what was
  previously stored. New permissions are added, removed ones are deleted.

## Problem 1 — Permission removed or renamed

A permission action is removed from all role registrations, or its action string is
changed (e.g. `datasources:query` → `datasources:read`). From the seeder's perspective
the old action disappeared. A rename also introduces a new action that the seeder has
never seen.

### Impact on custom roles

Custom roles are not managed by the seeder — they are managed by users (via API,
Terraform, or provisioning). The update/create role API enforces a privilege-escalation
check: the caller must hold every permission they are placing in the role. If a custom
role contains the old permission and that action no longer exists in any fixed or basic
role, then:

1. No user can hold the old permission (it is not granted anywhere).
2. Because no user holds it, no one can update or delete the role — the API rejects the
   request with 403.
3. The role is **effectively locked**: it cannot be modified through the UI, API, or
   Terraform.

Terraform scripts that manage these roles will fail on every apply since the provider
sends the full permission list and the API rejects it.

### Impact on basic roles (rename only)

The seeder diffs by `(BuiltInRole, Action, Scope)`. The old permission is removed from
the basic role and the new one is added. If an administrator had previously **removed**
the old permission from a basic role (e.g. revoking `datasources:query` from Viewer),
that customization is lost — the new `datasources:read` is re-granted because it is a
new entry in the desired set. The administrator's intent was "Viewers should not be able
to query data sources", but after the rename they silently regain the ability.

### Correct approach

**Do not remove the old permission from the role.** Instead:

1. Remove the old permission from the code that **checks** it (authorization logic). For
   a rename, start checking the new action instead.
2. For a rename, add the new permission to the role alongside the old one.
3. Mark the old permission as deprecated in a code comment and/or rename the action
   variable (e.g. `DeprecatedActionDatasourceQuery`).
4. After **one major release**, remove the deprecated permission from the role
   registration.

This protects custom roles and Terraform: the old permission stays grantable so roles
remain editable, and Terraform scripts keep working because the old action is still a
known permission.

### Known limitation — basic role re-granting on rename

Even with both permissions in the role, the new permission is a new entry in the desired
set. The seeder will add it to every basic role listed in `Grants`, regardless of
whether an administrator had previously revoked the old permission from that basic role.

The seeder's `permissionDiff` only detects scope changes for the *same* action
(`n.Action == p.Action`); it has no concept of "this new action replaces that old
action." The `Exclude` field on `RoleRegistration` excludes entire basic roles, not
individual permissions, so it cannot help here.

**Mitigation options:**

- **Document the rename in release notes** so administrators know to re-apply their
  customization for the new permission name. This is the minimum.
- **Add a stable UID per permission in the registration and seeder** (not yet
  implemented). Today `SeedPermission` is keyed by `(BuiltInRole, Action, Scope)`.
  If each permission in the registration carried a stable UID, the seeder could diff
  by `(BuiltInRole, UID)` instead. A renamed action would keep the same UID, so the
  seeder would treat it as an update rather than remove + add. If an admin had revoked
  that UID from a basic role, it would stay revoked regardless of the action string
  changing. This also generalizes to scope changes and combined renames — no one-off
  `Replaces` mappings needed. This is the correct long-term fix.

## Problem 2 — Fixed/plugin role removed

When a fixed or plugin role is no longer registered at startup, `RemoveAbsentRoles`
deletes it from the database. The deletion cascades to:

- `permission` — all permissions in the role
- `user_role` — all user ↔ role assignments
- `team_role` — all team ↔ role assignments
- `builtin_role` — all basic-role ↔ role assignments

Any Terraform configuration that references the role by UID (e.g.
`grafana_role_assignment`) will fail because the role no longer exists. Users or teams
that were assigned the role silently lose those assignments with no notification.

### Correct approach

1. Stop granting new permissions in the role (empty the `Permissions` slice if the
   permissions are still granted by other roles, or keep them if not).
2. Update the `DisplayName` to indicate deprecation, e.g. `"(Deprecated) Dashboard
   Reader"`.
3. Keep the role registered for one major release so Terraform configs and
   assignment references remain valid.
4. After the deprecation window, remove the role registration. `RemoveAbsentRoles` will
   then clean it up.

## Problem 3 — Fixed/plugin role renamed

Renaming a role's `Name` field (e.g. `fixed:dashboards:reader` →
`fixed:dashboards:viewer`) is equivalent to removing the old role and creating a new
one, because the seeder matches by name. The old role is deleted (with all its
assignments), and the new name is created from scratch. The same breakage as Problem 2
applies: Terraform references break, and all assignments are silently lost.

### Correct approach

Do not change the `Name` field of an existing role. The `Name` is the stable identifier
used by the seeder. Instead:

1. Change only the `DisplayName` (user-visible label) — this is safe and does not
   trigger deletion.
2. If the internal name absolutely must change (e.g. naming convention overhaul), treat
   it as a removal of the old name + creation of the new name, following the deprecation
   process in Problem 2.

---

The guiding principle: **old permissions stay in the role but are ignored by
authorization logic.** Old roles stay registered but are marked deprecated. The seeder
and API remain consistent, custom roles remain editable, and Terraform scripts keep
working. Cleanup happens after users have had time to adapt.
