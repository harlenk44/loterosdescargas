/**
 * Dirty Dozen Security Rule Verification Suite for LOTEROSDESCARGAS.
 * Reference specification matching security_spec.md and firestore.rules.
 */

export interface SecurityTestCase {
  id: string;
  title: string;
  targetPath: string;
  payload: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const dirtyDozenCases: SecurityTestCase[] = [
  {
    id: 'DD-01',
    title: 'Unverified Email Spoofing',
    targetPath: '/programs/prog_1',
    payload: { auth: { email: 'm4rl0nh3rn4nd3z@gmail.com', email_verified: false } },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    title: 'Self-Promoted Admin',
    targetPath: '/admins/attacker_uid',
    payload: { uid: 'attacker_uid', displayName: 'Attacker' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    title: 'Shadow Ghost Field on Program',
    targetPath: '/programs/prog_1',
    payload: { isVerifiedByGoogle: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    title: 'ID Poisoning',
    targetPath: '/programs/.._invalid_id',
    payload: { id: '../etc/passwd' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    title: 'Oversized String Exhaustion',
    targetPath: '/programs/prog_1/comments/c_1',
    payload: { body: 'x'.repeat(1201) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    title: 'Author Spoofing on Comment',
    targetPath: '/programs/prog_1/comments/c_1',
    payload: { authorId: 'victim_uid' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    title: 'Self-Pinning & Fake Admin Reply',
    targetPath: '/programs/prog_1/comments/c_1',
    payload: { pinned: true, adminReply: 'Official statement' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    title: 'Invalid SHA-256 Digest',
    targetPath: '/programs/prog_1/versions/v_1',
    payload: { sha256: 'not-a-valid-sha256-digest' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    title: 'Orphaned Version Write',
    targetPath: '/programs/nonexistent_prog/versions/v_1',
    payload: { programId: 'nonexistent_prog' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    title: 'Immutable Field Mutation',
    targetPath: '/programs/prog_1/comments/c_1',
    payload: { createdAt: '1999-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    title: 'Arbitrary Download Count Jump',
    targetPath: '/programs/prog_1',
    payload: { downloadCount: 999999 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    title: 'Comment Hijack Update',
    targetPath: '/programs/prog_1/comments/c_victim',
    payload: { body: 'Hijacked content' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
