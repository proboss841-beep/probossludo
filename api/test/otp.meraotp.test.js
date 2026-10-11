process.env.NODE_ENV = "test";
process.env.MERAOTP_API_KEY = "test-meraotp-key";

const { test, beforeEach } = await import("node:test");
const assert = (await import("node:assert/strict")).default;
const { otpStoreInit, createOtp, verifyOtp } = await import("../src/services/otp.service.js");

const values = new Map();
let providerResponses;
let providerRequests;

const redis = {
  incr: async (key) => {
    const value = Number(values.get(key) || 0) + 1;
    values.set(key, String(value));
    return value;
  },
  decr: async (key) => {
    const value = Number(values.get(key) || 0) - 1;
    values.set(key, String(value));
    return value;
  },
  expire: async () => 1,
  get: async (key) => values.get(key) || null,
  set: async (key, value, ...args) => {
    if (args.includes("NX") && values.has(key)) return null;
    values.set(key, String(value));
    return "OK";
  },
  del: async (...keys) => {
    for (const key of keys) values.delete(key);
    return keys.length;
  },
};

beforeEach(() => {
  values.clear();
  providerRequests = [];
  providerResponses = [];
  otpStoreInit(redis);
  globalThis.fetch = async (url, options) => {
    providerRequests.push({ url, options });
    const next = providerResponses.shift();
    return new Response(JSON.stringify(next.body), { status: next.status });
  };
});

test("MeraOTP verification uses the send message ID and clears it after success", async () => {
  providerResponses.push(
    { status: 200, body: { success: true, data: { message_id: "message-123" } } },
    { status: 200, body: { success: true, data: { message_id: "message-123", verified: true } } },
  );

  await createOtp("9876543210");
  assert.equal(values.get("otp:message:9876543210"), "message-123");

  await verifyOtp("9876543210", "123456");
  assert.equal(providerRequests[0].url, "https://meraotp.in/api/v1/otp/send");
  assert.equal(providerRequests[1].url, "https://meraotp.in/api/v1/otp/verify");
  assert.deepEqual(JSON.parse(providerRequests[1].options.body), {
    message_id: "message-123",
    otp: "123456",
  });
  assert.equal(providerRequests[1].options.headers.Authorization, "Bearer test-meraotp-key");
  assert.equal(values.has("otp:message:9876543210"), false);
  assert.equal(values.has("otp:verify:9876543210"), false);
});

test("an incorrect MeraOTP code is rejected without discarding the pending message ID", async () => {
  providerResponses.push(
    { status: 200, body: { success: true, data: { message_id: "message-456" } } },
    { status: 200, body: { success: true, data: { message_id: "message-456", verified: false } } },
  );

  await createOtp("9876543210");
  await assert.rejects(
    verifyOtp("9876543210", "000000"),
    { message: "OTP is incorrect or expired. Please request a new OTP." },
  );
  assert.equal(values.get("otp:message:9876543210"), "message-456");
});
