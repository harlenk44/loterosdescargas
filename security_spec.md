# LOTEROSDESCARGAS Security Specification

## 1. Data Invariants
1. **Admin Authority**: Only verified administrators (`email_verified == true` and bootstrapped admin email `m4rl0nh3rn4nd3z@gmail.com` or an existing `/admins/{uid}` record) can create, modify, or delete `programs` and `versions`, or pin/reply to comments.
2. **Parent Existence (Master Gate)**: Every `version` and `comment` document under `/programs/{programId}/...` MUST reference an existing parent `/programs/{programId}` document and match `programId` identically.
3. **Identity Integrity**:
   - `Program.ownerId` must equal `request.auth.uid` on create and remain immutable on update.
   - `ProgramVersion.authorId` must equal `request.auth.uid` on create and remain immutable on update.
   - `ProgramComment.authorId` must equal `request.auth.uid` on create and remain immutable on update.
4. **Non-Privileged Comment Creation**: Regular verified users cannot create comments with `pinned == true` or pre-populated `adminReply != ""` (unless they are an admin).
5. **Cryptographic Integrity Fields**: Every `ProgramVersion` requires an exact 64-char hex `sha256` and 64–128-char hex `signature` computed server-side during package upload.
6. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`; `createdAt` is immutable on update.
7. **No PII Exposure**: Publicly readable `programs`, `versions`, and `comments` contain zero emails, phone numbers, or addresses. `/admins/{userId}` does not store raw email PII and is only readable by the admin themselves or another admin.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Spoofing**: Admin email in token with `email_verified: false` attempting to create a program -> `PERMISSION_DENIED`.
2. **Self-Promoted Admin**: Regular user writing `/admins/{theirUid}` -> `PERMISSION_DENIED`.
3. **Shadow Ghost Field on Program**: Admin or user adding `isVerifiedByGoogle: true` to a `Program` document -> `PERMISSION_DENIED` (blocked by `hasOnly`).
4. **ID Poisoning**: Creating a document with a 300-character ID or invalid symbols (`../etc/passwd`) -> `PERMISSION_DENIED` (blocked by `isValidId`).
5. **Oversized String Exhaustion**: Comment `body` > 1200 chars or `Program.description` > 4000 chars -> `PERMISSION_DENIED`.
6. **Author Spoofing on Comment**: User A creating a comment with `authorId: "userB"` -> `PERMISSION_DENIED`.
7. **Self-Pinning / Fake Admin Reply**: Regular user creating a comment with `pinned: true` or `adminReply: "Official fix"` -> `PERMISSION_DENIED`.
8. **Invalid SHA-256 Digest**: Creating a version with `sha256: "not-a-hash"` -> `PERMISSION_DENIED`.
9. **Orphaned Version Write**: Creating a version under a nonexistent `programId` -> `PERMISSION_DENIED` (blocked by Master Gate `exists()`).
10. **Immutable Field Mutation**: User updating `createdAt` or `authorId` on their own comment -> `PERMISSION_DENIED`.
11. **Arbitrary Download Count Manipulation**: Non-admin user jumping `downloadCount` by `+9999` instead of `+1` -> `PERMISSION_DENIED`.
12. **Comment Hijack Update**: User A modifying User B's comment body -> `PERMISSION_DENIED`.
