# RBAC Authorization Service

This package implements the direct-DB RBAC authorization service used by the
Grafana API server. It handles `Check` (can subject X do verb Y on resource Z?)
and `List` (which instances of resource Z can subject X access?) requests.

## Two-path design

### Path 1 — Mapper-registered resources (legacy RBAC)

Resources explicitly registered in `NewMapperRegistry()` use the legacy RBAC
action format:

```
{resource}:{verb}   e.g. dashboards:read, folders:write
```

The mapper translates K8s `(group, resource, verb)` tuples into these legacy
action strings and the corresponding RBAC scope format
(`{resource}:{attribute}:{name}`, e.g. `dashboards:uid:abc`). This path exists
for backward compatibility with Grafana's existing permission store and UI.

### Path 2 — K8s-native fallback (new resources)

When a `(group, resource)` pair is **not found in the mapper**, the service
falls back to a deterministic translation implemented in `k8s_native_mapping.go`:

**Action format**: `{group}/{resource}:{verb}`

```
myapp.ext.grafana.app/widgets:get
myapp.ext.grafana.app/widgets:create
myapp.ext.grafana.app/widgets:update
myapp.ext.grafana.app/widgets:delete
myapp.ext.grafana.app/widgets:get_permissions
myapp.ext.grafana.app/widgets:set_permissions
```

Multiple K8s verbs collapse to a single RBAC verb:

| K8s verb          | RBAC verb        |
|-------------------|------------------|
| `get`             | `get`            |
| `list`            | `get`            |
| `watch`           | `get`            |
| `create`          | `create`         |
| `update`          | `update`         |
| `patch`           | `update`         |
| `delete`          | `delete`         |
| `deletecollection`| `delete`         |
| `get_permissions` | `get_permissions`|
| `set_permissions` | `set_permissions`|

**Scope format**: `{group}/{resource}:uid:{name}` (e.g. `myapp.ext.grafana.app/widgets:uid:abc123`)

Including the group in the scope ensures that two apps sharing the same resource
name (e.g. `app1.ext.grafana.app/widgets` and `app2.ext.grafana.app/widgets`)
have fully distinct scope strings, eliminating any risk of cross-app scope
collision when querying the permission store.

New applications should use this format for their permissions rather than
registering in the mapper.

## Why the K8s-native fallback is safe

**Security**: the fallback only determines *what to query*, it never grants
access. If no one has ever granted `myapp.ext.grafana.app/widgets:get` to a
subject, the permission store returns nothing, `scopeMap` is empty, and the
check correctly returns denied.

**Reachability**: `Check` and `List` requests reach this service through the
K8s API server authorization chain. The API server only routes requests for
resources that are registered and exist. An attacker cannot manufacture a
`Check` request for an arbitrary group/resource pair through normal API usage.

## Why folder support is always assumed true in the fallback

The `k8sNativeMapping` returns `HasFolderSupport() = true` unconditionally.
This is the safe default for two reasons:

1. **False negative risk if defaulted to false**: if a resource *does* live in a
   folder and `HasFolderSupport()` is false, folder-scoped permission inheritance
   is silently disabled. A user granted access to a parent folder would be
   incorrectly denied access to resources inside it.

2. **No risk if defaulted to true for a flat resource**: if a resource does *not*
   live in a folder, the folder tree traversal simply finds no ancestors and the
   check correctly returns false. The only cost is a (cached) folder tree lookup
   that returns an empty result — a minor and bounded performance overhead.

Defaulting to `true` therefore favours correctness over a small performance
optimisation. Resources that must explicitly opt out of folder inheritance can
register in the mapper with `folderSupport: false`.
