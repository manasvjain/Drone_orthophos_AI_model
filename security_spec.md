# SVAMITVA AI — Firestore Security Specification

## 1. Data Invariants
1. **Identity & Email Verification**: All user-scoped reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
2. **PII Isolation**: User email is stored only at `/users/{userId}/private/info`, never on `/users/{userId}` or `/projects/{projectId}`, and is readable/writable strictly by `userId == request.auth.uid`.
3. **Self-Assigned Role Prevention**: `/users/{userId}` restricts `role` strictly to `'GIS Analyst'` on creation and prevents privilege escalation on update.
4. **Master Gate & Project Ownership**: Every `/projects/{projectId}` document binds `ownerId == request.auth.uid`. Every `/projects/{projectId}/features/{featureId}` document verifies parent existence and ownership via `get(/databases/$(database)/documents/projects/$(projectId)).data.ownerId == request.auth.uid` on single-doc access/mutation, while storing `ownerId` so `allow list` enforces `resource.data.ownerId == request.auth.uid` without `get()`.
5. **Strict Timestamps & Immutability**: `createdAt == request.time` and `updatedAt == request.time` on creation; `createdAt == existing().createdAt` and `ownerId == existing().ownerId` on update.

## 2. Adversarial "Dirty Dozen" Test Payloads
1. Unauthenticated read/write to `/projects/PRJ-HR-2026-014` -> `PERMISSION_DENIED`.
2. Unverified email token (`email_verified: false`) attempting create on `/projects/PRJ-01` -> `PERMISSION_DENIED`.
3. Cross-user `get` on `/users/victimUid/private/info` -> `PERMISSION_DENIED`.
4. Shadow/Ghost field injection (`{ isAdmin: true }`) on `/users/{uid}` -> `PERMISSION_DENIED` (`hasOnly()` gate).
5. Self-assigned escalated role (`role: 'Survey Supervisor'`) on `/users/{uid}` -> `PERMISSION_DENIED`.
6. Owner spoofing (`ownerId: 'otherUid'`) creating `/projects/PRJ-02` -> `PERMISSION_DENIED`.
7. Owner mutation (`ownerId: 'attacker'`) on existing `/projects/PRJ-HR-2026-014` -> `PERMISSION_DENIED`.
8. Oversized ID poisoning (`1500-char` document ID) -> `PERMISSION_DENIED` (`isValidId()`).
9. Client timestamp tampering (`createdAt: '2020-01-01'`) -> `PERMISSION_DENIED` (`== request.time`).
10. Orphaned feature creation (`projectId` doesn't exist or owned by another user) -> `PERMISSION_DENIED`.
11. Unconstrained list query attempting cross-tenant project enumeration -> `PERMISSION_DENIED` (`resource.data.ownerId == request.auth.uid`).
12. Oversized array / string payload injection (`village` > 120 chars or `points` > 300 entries) -> `PERMISSION_DENIED`.
