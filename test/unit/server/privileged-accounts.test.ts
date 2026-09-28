import assert from "node:assert/strict";
import test from "node:test";
import {
  hasComplimentaryAccess,
  hasSuperAdminAccess,
  isProtectedAccountEmail,
} from "../../../server/privileged-accounts";

test("recognizes verified privileged-domain accounts across access policies", () => {
  const user = { email: "Staff@BobbleDigital.com", emailVerified: true };

  assert.equal(isProtectedAccountEmail(user.email), true);
  assert.equal(hasSuperAdminAccess(user), true);
  assert.equal(hasComplimentaryAccess(user), true);
});

test("requires privileged-domain accounts to be verified for access", () => {
  const user = { email: "staff@bobbledigital.com", emailVerified: false };

  assert.equal(isProtectedAccountEmail(user.email), true);
  assert.equal(hasSuperAdminAccess(user), false);
  assert.equal(hasComplimentaryAccess(user), false);
});

test("recognizes every explicitly allowed super-admin email", () => {
  assert.equal(hasSuperAdminAccess({ email: "adam.oldfield@force24.co.uk", emailVerified: false }), true);
  assert.equal(hasSuperAdminAccess({ email: "tech-enterprise@alpon.xyz", emailVerified: false }), true);
});

test("keeps the complimentary-access allow-list separate", () => {
  assert.equal(hasComplimentaryAccess({ email: "adam@force24.co.uk", emailVerified: false }), true);
  assert.equal(hasSuperAdminAccess({ email: "adam@force24.co.uk", emailVerified: true }), false);
});

test("rejects ordinary accounts", () => {
  const user = { email: "person@example.com", emailVerified: true };

  assert.equal(isProtectedAccountEmail(user.email), false);
  assert.equal(hasSuperAdminAccess(user), false);
  assert.equal(hasComplimentaryAccess(user), false);
});
