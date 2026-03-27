# Action Sets for Managed Routes

## Context

Managed routes (`alert.notifications.routes.managed:*`) are a **new** resource with per-route granular permissions, replacing the legacy unscoped `alert.notifications.routes:read/write` actions. Since there is no existing permission data to preserve, we can adopt action sets from the start — avoiding the two-phase migration that dashboards and service accounts required.

## Current State

### Action sets are already registered in-memory but never used

`ProvideRoutePermissionsService` in `ossaccesscontrol/routes.go` calls `resourcepermissions.New()`, which calls:

```go
actionSetService.StoreActionSet(GetActionSetName("routes", permission), actions)
```

This produces three in-memory action sets:

| Token | Expands to |
|-------|-----------|
| `routes:view` | `alert.notifications.routes.managed:read` |
| `routes:edit` | `alert.notifications.routes.managed:read`, `…:write`, `…:delete` |
| `routes:admin` | all of edit + `routes.permissions:read`, `routes.permissions:write` |

### Write path ignores routes

`mapPermission()` in `resourcepermissions/service.go` only emits action set tokens for folders and dashboards:

```go
// line 362-371
if s.options.Resource == dashboards.ScopeFoldersRoot || s.options.Resource == dashboards.ScopeDashboardsRoot {
    actions = append(actions, GetActionSetName(s.options.Resource, permission))
    if s.features.IsEnabledGlobally(featuremgmt.FlagOnlyStoreActionSets) {
        return actions, nil
    }
}
```

For routes, it falls through and writes only granular actions.

### Read path ignores routes

`isFolderOrDashboardAction()` filters action sets during resolution:

```go
// line 603-605
func isFolderOrDashboardAction(action string) bool {
    return strings.HasPrefix(action, dashboards.ScopeDashboardsRoot) || strings.HasPrefix(action, dashboards.ScopeFoldersRoot)
}
```

`routes:view`, `routes:edit`, `routes:admin` are silently ignored. The 4 call sites in `service.go` (lines ~181, ~525, ~541, ~554) all use this predicate.

### The existing migration writes granular actions

`managedRoutesPermissions` in `alerting.go` inserts individual `alert.notifications.routes.managed:read/write/delete` rows into the `permission` table, bypassing `mapPermission()` entirely.

## What Needs to Change

### 1. Expand the action-set predicate (read path)

Rename `isFolderOrDashboardAction` → `isActionSetEnabledResource` and include `routes`:

```go
func isActionSetEnabledResource(action string) bool {
    return strings.HasPrefix(action, dashboards.ScopeDashboardsRoot) ||
        strings.HasPrefix(action, dashboards.ScopeFoldersRoot) ||
        strings.HasPrefix(action, "routes")
}
```

**4 call sites** in `resourcepermissions/service.go` must be updated:
- `GetResourcePermissions()` expansion loop (~line 181)
- `ResolveAction()` filter (~line 525)
- `ResolveActionPrefix()` filter (~line 541)
- `ResolveActionSet()` filter (~line 554)

**Risk**: Low. `routes:view`/`routes:edit`/`routes:admin` don't collide with any existing action names (unlike e.g. `datasources:read` which is why the filter exists).

### 2. Expand `mapPermission()` (write path)

Add routes to the block that emits action set tokens. Since this is a new resource with no legacy data, we can go straight to action-set-only:

```go
if s.options.Resource == dashboards.ScopeFoldersRoot || s.options.Resource == dashboards.ScopeDashboardsRoot {
    actions = append(actions, GetActionSetName(s.options.Resource, permission))
    if s.features.IsEnabledGlobally(featuremgmt.FlagOnlyStoreActionSets) {
        return actions, nil
    }
}

// Routes are new — always store only the action set token.
if s.options.Resource == "routes" {
    return []string{GetActionSetName(s.options.Resource, permission)}, nil
}
```

This means `SetDefaultPermissions()` and `SetPermissions()` in `RoutePermissionsService` will write `routes:view`/`routes:edit`/`routes:admin` tokens, not granular actions.

**No feature flag needed** because there is no pre-existing granular data to keep compatible. The read path (step 1) handles expansion.

### 3. Update `GetResourcePermissions()` expansion (~line 177-201)

The expansion loop currently only handles dashboards/folders:

```go
if s.options.Resource == dashboards.ScopeFoldersRoot {
    expandedActions = append(expandedActions, actionSetActions...)
    continue
}
// This check is needed for resolving inherited permissions
for _, actionSetAction := range actionSetActions {
    if slices.Contains(s.actions, actionSetAction) { ... }
}
```

Routes don't have inherited permissions (no folder hierarchy), so the expansion is simpler — expand all actions unconditionally, like folders:

```go
if s.options.Resource == dashboards.ScopeFoldersRoot || s.options.Resource == "routes" {
    expandedActions = append(expandedActions, actionSetActions...)
    continue
}
```

### 4. Update the migration to write action set tokens

Change `managedRoutesPermissions.Exec()` to write `routes:view`/`routes:edit` instead of granular actions:

| Basic role | Current (granular) | New (action set) |
|---|---|---|
| Viewer | `alert.notifications.routes.managed:read` | `routes:view` |
| Editor | `…:read`, `…:write`, `…:delete` (3 rows) | `routes:edit` (1 row) |

The migration writes fewer rows and the read path expands them. The scope (`routes:uid:user-defined`) stays the same — it's on the permission row, not in the action.

```go
scope := models.ScopeRoutesProvider.GetResourceScopeUID(models.DefaultRoutingTreeName)
viewerAction := resourcepermissions.GetActionSetName("routes", string(models.PermissionView))
editorAction := resourcepermissions.GetActionSetName("routes", string(models.PermissionEdit))
// ... insert one row per role instead of 1-3 granular rows
```

Since this migration hasn't shipped to a release yet (commit `95f9d9830bb` is recent), it can be amended rather than adding a follow-up migration.

### 5. Update fixed roles in `roles.go`

`pkg/services/ngalert/accesscontrol/roles.go` declares fixed roles with granular actions:

```go
{Action: accesscontrol.ActionAlertingManagedRoutesRead, Scope: models.ScopeRoutesAll},
```

These should remain as-is — fixed roles always use granular actions. Action sets are only for **managed** (resource permission) roles. The `ExpandActionSets` call on the read path handles the translation.

## Summary of Changes

| File | Change | Risk |
|------|--------|------|
| `resourcepermissions/service.go` | Rename `isFolderOrDashboardAction` → `isActionSetEnabledResource`, add `"routes"` prefix | Low — no name collision |
| `resourcepermissions/service.go` | Add `"routes"` block in `mapPermission()` (action-set-only, no flag) | Low — new resource, no existing data |
| `resourcepermissions/service.go` | Expand routes action sets in `GetResourcePermissions()` like folders | Low |
| `migrations/accesscontrol/alerting.go` | Write `routes:view`/`routes:edit` tokens in migration instead of granular actions | Low — migration hasn't shipped |
| `resourcepermissions/service.go` tests | Add route action set test cases | — |
| `migrations/accesscontrol/alerting.go` tests | Verify migration writes action set tokens | — |

## Why No Feature Flag

Dashboards and service accounts needed feature flags (`FlagOnlyStoreActionSets`, `FlagOnlyStoreServiceAccountActionSets`) because they had **years of existing granular permission rows** in production databases. The flags gated the transition:
1. First, write both action set tokens AND granular actions (flag off)
2. Run a backfill migration to add action set tokens to old rows
3. Enable the flag to stop writing granular actions

Routes don't have this problem — they're new. There is no pre-existing data. We write action sets from day one and the read path expands them. No two-phase rollout needed.

## Verification

1. **Unit test**: `mapPermission("Edit")` for resource `"routes"` returns `["routes:edit"]` (not granular actions)
2. **Unit test**: `ResolveActionSet("routes:edit")` returns the expected granular actions
3. **Integration test**: `SetDefaultPermissions` for a new route stores `routes:view`/`routes:edit` rows, and `GetResourcePermissions` expands them back to granular actions
4. **Migration test**: The migration inserts `routes:view`/`routes:edit` tokens with the correct scope, and existing permissions are not duplicated
