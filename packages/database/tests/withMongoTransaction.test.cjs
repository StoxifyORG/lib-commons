const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Import from built dist
const {
  connectDatabase,
  withMongoTransaction,
  UserRole,
  Coupon,
} = require('../dist');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stoxify?directConnection=true';

test('withMongoTransaction integration test suite', async (t) => {
  t.after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  await t.test('throws descriptive error if connectDatabase has not been called', async () => {
    // Note: this test runs first, before connectDatabase()
    await assert.rejects(
      async () => {
        await withMongoTransaction(async () => {
          return 'should not reach here';
        });
      },
      {
        message: 'withMongoTransaction: mongoose is not connected. Call connectDatabase() first.',
      }
    );
  });

  await t.test('connects to MongoDB replica set', async () => {
    await connectDatabase({
      uri: MONGO_URI,
      options: { maxPoolSize: 2, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 },
    });
  });

  await t.test('commits multiple document writes atomically on success', async () => {
    const testRoleId = 'ROLE_TEST_TX_COMMIT_' + Date.now();
    const testCouponCode = 'COUPON_TX_COMMIT_' + Date.now();

    const result = await withMongoTransaction(async (session) => {
      const [role] = await UserRole.create([
        {
          user_id: 'USER_TX_COMMIT',
          role_id: testRoleId,
          assigned_by: 'SYSTEM',
        },
      ], { session });

      const [coupon] = await Coupon.create([
        {
          coupon_id: 'COUPON_ID_' + Date.now(),
          code: testCouponCode,
          analyst_id: 'ANALYST_TX_COMMIT',
          type: 'PERCENTAGE',
          discount_value: 10,
          valid_from: new Date(),
          valid_to: new Date(Date.now() + 86400000),
        },
      ], { session });

      return { roleId: role.role_id, couponCode: coupon.code };
    });

    assert.equal(result.roleId, testRoleId);
    assert.equal(result.couponCode, testCouponCode);

    // Verify both records are committed and visible in MongoDB
    const persistedRole = await UserRole.findOne({ role_id: testRoleId });
    assert.ok(persistedRole, 'UserRole document must be persisted');

    const persistedCoupon = await Coupon.findOne({ code: testCouponCode });
    assert.ok(persistedCoupon, 'Coupon document must be persisted');

    // Clean up
    await UserRole.deleteOne({ role_id: testRoleId });
    await Coupon.deleteOne({ code: testCouponCode });
  });

  await t.test('aborts transaction and rolls back writes if callback throws', async () => {
    const testRoleId = 'ROLE_TEST_TX_ABORT_' + Date.now();
    const testCouponCode = 'COUPON_TX_ABORT_' + Date.now();

    await assert.rejects(
      async () => {
        await withMongoTransaction(async (session) => {
          await UserRole.create([
            {
              user_id: 'USER_TX_ABORT',
              role_id: testRoleId,
              assigned_by: 'SYSTEM',
            },
          ], { session });

          // Simulate mid-transaction failure
          throw new Error('Simulated write failure midway through transaction');

          // Unreachable
          await Coupon.create([
            {
              code: testCouponCode,
              analyst_id: 'ANALYST_TX_ABORT',
              discount_type: 'PERCENTAGE',
              discount_value: 10,
              valid_from: new Date(),
              valid_until: new Date(Date.now() + 86400000),
              max_uses: 100,
            },
          ], { session });
        });
      },
      {
        message: 'Simulated write failure midway through transaction',
      }
    );

    // Verify UserRole was rolled back and is NOT present in MongoDB
    const rolledBackRole = await UserRole.findOne({ role_id: testRoleId });
    assert.equal(rolledBackRole, null, 'UserRole must be rolled back on abort');

    const unreachedCoupon = await Coupon.findOne({ code: testCouponCode });
    assert.equal(unreachedCoupon, null, 'Coupon must not exist');
  });

  await t.test('joins existing session without starting a new transaction when options.session is provided', async () => {
    const outerRoleId = 'ROLE_OUTER_' + Date.now();
    const innerRoleId = 'ROLE_INNER_' + Date.now();

    // Nested service simulation
    async function innerServiceMethod(session) {
      return withMongoTransaction(async (s) => {
        const [doc] = await UserRole.create([
          {
            user_id: 'USER_NESTED_INNER',
            role_id: innerRoleId,
            assigned_by: 'SYSTEM',
          },
        ], { session: s });
        return doc;
      }, { session });
    }

    // When both succeed
    await withMongoTransaction(async (session) => {
      await UserRole.create([
        {
          user_id: 'USER_NESTED_OUTER',
          role_id: outerRoleId,
          assigned_by: 'SYSTEM',
        },
      ], { session });

      await innerServiceMethod(session);
    });

    // Both should be committed
    const foundOuter = await UserRole.findOne({ role_id: outerRoleId });
    assert.ok(foundOuter, 'Outer write must be committed');
    const foundInner = await UserRole.findOne({ role_id: innerRoleId });
    assert.ok(foundInner, 'Inner write must be committed');

    // Clean up
    await UserRole.deleteOne({ role_id: outerRoleId });
    await UserRole.deleteOne({ role_id: innerRoleId });
  });

  await t.test('nested session aborts outer transaction if inner throws', async () => {
    const outerRoleId = 'ROLE_OUTER_FAIL_' + Date.now();
    const innerRoleId = 'ROLE_INNER_FAIL_' + Date.now();

    async function failingInnerMethod(session) {
      return withMongoTransaction(async (s) => {
        await UserRole.create([
          {
            user_id: 'USER_INNER_FAIL',
            role_id: innerRoleId,
            assigned_by: 'SYSTEM',
          },
        ], { session: s });
        throw new Error('Inner method failed');
      }, { session });
    }

    await assert.rejects(
      async () => {
        await withMongoTransaction(async (session) => {
          await UserRole.create([
            {
              user_id: 'USER_OUTER_FAIL',
              role_id: outerRoleId,
              assigned_by: 'SYSTEM',
            },
          ], { session });

          await failingInnerMethod(session);
        });
      },
      {
        message: 'Inner method failed',
      }
    );

    // Both should have been rolled back
    const foundOuter = await UserRole.findOne({ role_id: outerRoleId });
    assert.equal(foundOuter, null, 'Outer write must roll back when inner fails');
    const foundInner = await UserRole.findOne({ role_id: innerRoleId });
    assert.equal(foundInner, null, 'Inner write must roll back when inner fails');
  });
});
