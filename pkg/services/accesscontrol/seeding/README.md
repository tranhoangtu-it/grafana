## Context

In our traditional (monolithic) architecture, each Grafana instance seeds its database with core permissions and installed plugin permissions during startup. The instance reads core code and `plugin.json` files, computes the final `basic_admin`, `basic_editor`, `basic_viewer`, and `basic_none` roles, and writes them to the database via `FixedRolesLoader` → `RegisterFixedRoles()` → `Seeder.Seed()`.

As we move to a fully multi-tenant App Platform, tenants no longer have dedicated Grafana instances. Roles are stored in Unified Storage as cluster-scoped `GlobalRole` resources (`iam.grafana.app/v0alpha1`) and can be referenced at namespace level. Without per-tenant instance startup hooks, we need a new mechanism to:

1. **Seed and update core Grafana GlobalRoles** (fixed roles) from a declarative source (YAML file / ConfigMap).
2. **Seed and update Basic GlobalRoles** (`basic_admin`, `basic_editor`, `basic_viewer`, `basic_none`) by aggregating permissions from all GlobalRoles annotated with `grafana.app/role-binding`.
3. **Ensure single-writer semantics** so only one IAM App replica performs the seeding, avoiding conflicts.

## Current Architecture (Legacy)

| Component | Code Path | Purpose |
|---|---|---|
| `FixedRolesLoader` | `pkg/services/accesscontrol/fixedrolesloader.go` | Startup service that triggers `RegisterFixedRoles()` |
| `Seeder` | `pkg/services/accesscontrol/seeding/seeder.go` | Diffs desired vs. stored permissions, applies changes |
| `BuildBasicRoleDefinitions()` | `pkg/services/accesscontrol/roles.go:447` | Defines empty shell basic roles (`basic:admin`, `basic:editor`, `basic:viewer`, `basic:none`, `basic:grafana_admin`) |
| `AppendDesiredPermissions()` | `pkg/services/accesscontrol/seeding/seeder.go:270` | Merges fixed/plugin role permissions into basic roles using `BuiltInRolesWithParents()` |
| `BuiltInRolesWithParents()` | `pkg/services/accesscontrol/models.go:553` | Computes inheritance: Viewer < Editor < Admin |
| `RoleRegistration.Grants` | `pkg/services/accesscontrol/models.go` | Declares which basic roles receive a fixed role's permissions |
| `IAMClient.FetchIAMRoles()` | `pkg/extensions/accesscontrol/iamclient/client.go` | Enterprise: fetches `GlobalRole` CRDs, converts to `RoleRegistration` using `grafana.app/role-binding` annotation |
| `AppManifest Reconciler` | `pkg/extensions/apps/appmanifest/pkg/app/reconciler.go` | Creates/updates GlobalRoles from app manifests |
| `ApiInstaller` (GlobalRole) | `pkg/registry/apis/iam/api_installer.go` | Interface for GlobalRole API registration (OSS = noop) |
| `GlobalRoleApiInstaller` (enterprise) | `pkg/extensions/apiserver/registry/iam/globalrole/api_installer.go` | Enterprise GlobalRole API installer; will host the new background jobs |
| Leader Election (Zanzana) | `pkg/services/authz/zanzana/server/reconciler/leader_election.go` | K8s Lease-based leader election for the Zanzana MT reconciler |

## Annotation Conventions

| Annotation | Purpose | Example |
|---|---|---|
| `iam.grafana.app/role-name` | Maps GlobalRole to internal role name | `fixed:folders.permissions:reader` |
| `grafana.app/role-binding` | Declares which basic role a GlobalRole's permissions are granted to | `viewer`, `editor`, `admin` |
| `iam.grafana.app/managed-by` | Identifies which component owns a GlobalRole (protects from external mutation) | `file-provisioner`, `basic-role-aggregator` |

## Action Items

### 1. Core GlobalRole File Watcher — background job in the IAM API server

**Description:** Add a background job to the enterprise IAM API server code that watches a YAML file (or directory) containing core Grafana fixed GlobalRole definitions. On file change, the job CRUDs the corresponding `GlobalRole` resources in Unified Storage. This runs in-process within the Grafana API server (but only the elected leader actually performs writes; see item 4).

**Code paths to modify/create:**

| Action | Path |
|---|---|
| New: YAML role file watcher job | `pkg/extensions/apiserver/registry/iam/globalrole/file_watcher.go` (new) |
| Wire into GlobalRole API installer | `pkg/extensions/apiserver/registry/iam/globalrole/api_installer.go` — start as a background job |
| YAML role definitions | Configurable path (e.g. ConfigMap mount or `conf/globalroles.yaml`) |
| GlobalRole client | Use existing `apps/iam/pkg/apis/iam/v0alpha1/` generated client |
| File watching pattern | Reuse `fsnotify` pattern from `apps/provisioning/pkg/repository/local/watch.go` |

**Behavior:**
- On startup and on file change: parse YAML, list existing GlobalRoles filtered by `iam.grafana.app/managed-by: file-provisioner` annotation, diff, create/update/delete to match the file state.
- Each GlobalRole in the file will be created by the background job with the `iam.grafana.app/role-name`, `grafana.app/role-binding`, and `iam.grafana.app/managed-by: file-provisioner` annotations.
- The file format should be a list of GlobalRole manifests (similar to existing JSON examples in the repo).

### 2. Basic Role Aggregation — background job in the IAM API server

**Description:** Add a second background job to the enterprise IAM API server code that periodically reads all `GlobalRole` resources, checks for the `grafana.app/role-binding` annotation, and aggregates their permissions into the four Basic GlobalRoles (`basic_admin`, `basic_editor`, `basic_viewer`, `basic_none`), respecting the inheritance chain: `None < Viewer < Editor < Admin`. Runs in the same process as the file watcher.

**Code paths to modify/create:**

| Action | Path |
|---|---|
| New: Aggregation background job | `pkg/extensions/apiserver/registry/iam/globalrole/basic_role_aggregator.go` (new) |
| Wire into GlobalRole API installer | `pkg/extensions/apiserver/registry/iam/globalrole/api_installer.go` — start alongside the file watcher |
| Inheritance logic | Port from `pkg/services/accesscontrol/models.go:BuiltInRolesWithParents()` and `pkg/apimachinery/identity/role_type.go:Parents()` |
| Permission merging logic | Port from `pkg/services/accesscontrol/seeding/seeder.go:AppendDesiredPermissions()` |
| GlobalRole list/watch | Use informer or periodic list via generated IAM client |
| Basic role names | `basic_admin`, `basic_editor`, `basic_viewer`, `basic_none` (see `pkg/services/accesscontrol/roles.go:30-31,447-505`) |

**Algorithm:**

```
1. List all GlobalRoles in the cluster
2. For each GlobalRole with annotation `grafana.app/role-binding`:
   a. Parse the binding level (viewer, editor, admin)
   b. Expand with inheritance: viewer → {viewer, editor, admin}, editor → {editor, admin}, admin → {admin}
   c. Add permissions to the corresponding basic role sets
3. For each basic role (admin, editor, viewer, none):
   a. Get or create the Basic GlobalRole (e.g. name=basic_admin, annotation iam.grafana.app/role-name=basic:admin)
   b. Diff current permissions vs. computed permissions
   c. Update if changed
4. basic_none always remains empty (no permissions)
```

**Key design decisions:**
- The aggregation job is the **sole writer** of basic role GlobalRoles. No other component should mutate them directly.
- The `iam.grafana.app/managed-by: basic-role-aggregator` annotation protects basic roles from external mutation (enforced by admission in `GlobalRoleApiInstaller`).
- The job is eventually consistent — a small delay (seconds) between a GlobalRole change and basic role recomputation is acceptable since Zanzana is already eventually consistent.

### 3. Empty Basic None Role

**Description:** Ensure a `basic_none` GlobalRole exists in the cluster with zero permissions. This is the baseline role for users with `None` org role assignment.

**Code path:**
- Created and maintained by the basic role aggregation job (action item 2).
- The job always writes `basic_none` with `spec.permissions: []`.
- Name: `basic_none`, annotation: `iam.grafana.app/role-name: basic:none`.

### 4. Leader Election across replicas

**Description:** In a multi-replica deployment, every Grafana API server instance runs the same background jobs. However, only the elected leader should perform GlobalRole writes (file watcher CRUD and basic role aggregation). All replicas participate in leader election; non-leaders stay idle and take over if the leader goes down.

**Code paths to modify/create:**

| Action | Path |
|---|---|
| Reuse existing leader election | `pkg/services/authz/zanzana/server/reconciler/leader_election.go` — extract `LeaderElector` interface to a shared package |
| New shared package | `pkg/infra/leaderelection/` (extract from Zanzana reconciler) |
| Wire into GlobalRole API installer | `pkg/extensions/apiserver/registry/iam/globalrole/api_installer.go` — wrap both background jobs with `leaderElector.Run()` |
| Configuration | Add `[iam.leader_election]` section to `defaults.ini` mirroring `[zanzana.reconciler]` leader election config |

**How it works:**

```go
// In pkg/extensions/apiserver/registry/iam/globalrole/api_installer.go — conceptual wiring
leaderElector.Run(ctx, func(leaderCtx context.Context) {
    // Only runs while this replica holds the lease.
    // leaderCtx is cancelled when leadership is lost.
    go fileWatcher.Run(leaderCtx)
    go basicRoleAggregator.Run(leaderCtx)
    <-leaderCtx.Done()
})
```

Every replica attempts to acquire the K8s Lease. The winner starts the two background jobs. If the leader crashes, another replica acquires the lease and takes over.

**Options considered:**

| Mechanism | Pros | Cons | Recommendation |
|---|---|---|---|
| **K8s Lease-based** (current Zanzana pattern) | Already implemented, battle-tested in K8s ecosystem, clean leader/follower callbacks | Requires K8s API access (always available in our case) | **Recommended** — reuse and extract `KubernetesLeaderElector` |
| **dskit ring + memberlist** (mentioned as "whisper") | Already used for search server distribution, gossip-based (no external deps) | Designed for request distribution not single-writer election; would need custom "owner of token 0" logic; more complex | Not recommended for this use case |
| **Database lock** (`serverLock.LockExecuteAndRelease`) | Used by legacy seeder (`oss-ac-basic-role-seeder`), works with SQL | Polling-based, coarser granularity, not suitable for continuous background jobs | Not recommended |

## Desired Approach

### Phase 1: Extract and wire leader election

1. Extract `LeaderElector` / `KubernetesLeaderElector` / `NoopLeaderElector` from `pkg/services/authz/zanzana/server/reconciler/leader_election.go` into a shared package (e.g. `pkg/infra/leaderelection/`).
2. Make both the Zanzana reconciler and the IAM GlobalRole API installer use the shared package.
3. In the GlobalRole API installer, wrap the two new background jobs under `leaderElector.Run()`.

### Phase 2: Core GlobalRole file watcher (background job)

1. Create `pkg/extensions/apiserver/registry/iam/globalrole/file_watcher.go` using `fsnotify`.
2. On change: parse YAML, diff against existing GlobalRoles (filtered by `iam.grafana.app/managed-by: file-provisioner`), create/update/delete.
3. Start from `api_installer.go` as a background job (runs only when leader).
4. Define core GlobalRole YAML at a configurable path (e.g. ConfigMap mount).

### Phase 3: Basic role aggregation (background job)

1. Create `pkg/extensions/apiserver/registry/iam/globalrole/basic_role_aggregator.go`.
2. Periodically (e.g. every 30s) or via informer: list all GlobalRoles, filter by `grafana.app/role-binding`, compute basic role permission sets using inheritance, diff and update basic GlobalRoles.
3. Always ensure `basic_none` exists with empty permissions.
4. Start from `api_installer.go` as a background job (runs only when leader).

### Phase 4: Integration and migration

1. Feature-flag the new background jobs behind `FlagKubernetesAuthzGlobalRolesApi` (existing flag).
2. Dual-run: keep the legacy `FixedRolesLoader` active while the new jobs are in rollout.
3. Validate: basic roles produced by the aggregation job match the legacy seeder output.
4. Deprecate the legacy `FixedRolesLoader` path once fully migrated.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Grafana API Server (per replica, N replicas in the cluster)             │
│                                                                          │
│  pkg/extensions/apiserver/registry/iam/globalrole/                       │
│  ┌──────────────────────────────────────┐                                │
│  │  GlobalRoleApiInstaller               │                                │
│  │  (serves GlobalRole CRUD API +        │                                │
│  │   starts background jobs)             │                                │
│  └──────────────────┬───────────────────┘                                │
│                     │                                                    │
│  ┌──────────────────▼───────────────────┐                                │
│  │  K8s Lease Leader Election            │  ← all replicas participate   │
│  └──────────────────┬───────────────────┘                                │
│                     │ only the leader runs:                               │
│  ┌──────────────────▼───────────────────────────────────────────────┐    │
│  │                                                                   │    │
│  │  ┌─────────────────────────┐   ┌────────────────────────────────┐│    │
│  │  │  Background Job 1:       │   │  Background Job 2:              ││    │
│  │  │  GlobalRole File Watcher │   │  Basic Role Aggregation         ││    │
│  │  │                          │   │                                  ││    │
│  │  │  • Watches YAML file     │   │  • Lists all GlobalRoles        ││    │
│  │  │  • CRUDs fixed           │   │    with role-binding annotation ││    │
│  │  │    GlobalRoles           │   │  • Computes basic roles         ││    │
│  │  │  • managed-by:           │   │    with inheritance             ││    │
│  │  │    file-provisioner      │   │  • managed-by:                  ││    │
│  │  │                          │   │    basic-role-aggregator        ││    │
│  │  └──────────┬───────────────┘   └──────────────────┬─────────────┘│    │
│  │             │                                      │              │    │
│  └─────────────┼──────────────────────────────────────┼──────────────┘    │
│                │                                      │                   │
│                ▼                                      ▼                   │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │           Unified Storage (GlobalRole CRDs)                      │     │
│  │                                                                   │     │
│  │  fixed_*  (managed-by: file-provisioner)                          │     │
│  │  app_*    (managed-by: app-manifest-controller)  ← external       │     │
│  │  basic_*  (managed-by: basic-role-aggregator)                     │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

Sources of GlobalRoles:
  1. Background Job 1 (in GlobalRoleApiInstaller) → core fixed roles (from YAML)
  2. App Manifest Controller (separate, existing) → app roles
  3. Background Job 2 (in GlobalRoleApiInstaller) → basic_admin, basic_editor, basic_viewer, basic_none
```

## Open Questions

1. **Informer vs. polling for the aggregation job?** An informer on GlobalRoles gives near-instant reaction but adds complexity. Periodic polling (every 30s) is simpler and acceptable given eventual consistency. Start with polling, optimize later.
2. **Should the file watcher path be configurable or hardcoded?** Recommend configurable via INI (`[iam] global_roles_file = /path/to/globalroles.yaml`) with a sensible default.
3. **Should we add a `grafana.app/role-binding` annotation to existing GlobalRole examples?** Yes — the App Manifest Controller already sets this when creating app GlobalRoles. Core fixed roles should also include it in the YAML source file.
4. **Grafana Admin handling?** `basic:grafana_admin` inherits from no org role. The aggregation job should handle it as a special case (only GlobalRoles with explicit `grafana_admin` binding contribute).
5. **dskit ring vs. K8s Lease?** The design doc mentions "whisper mechanism with dskit." However, K8s Lease-based leader election is already proven in the Zanzana reconciler and is simpler for single-writer election. The dskit ring is better suited for sharded workload distribution. Recommendation: use K8s Lease.
