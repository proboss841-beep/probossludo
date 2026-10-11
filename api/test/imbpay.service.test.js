process.env.NODE_ENV = "test";
process.env.IMB_API_URL = "https://api.imbpay.in";
process.env.IMB_API_TOKEN = "test-imb-token";

const { test, after } = await import("node:test");
const assert = (await import("node:assert/strict")).default;
const imbpay = await import("../src/services/imbpay.service.js");

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

test("createOrder sends the documented form fields and returns the hosted checkout URL", async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      status: true,
      result: {
        payment_url: "https://checkout.example/pay/order-1",
        check_link: "https://check.example/order-1",
      },
    }));
  };

  const order = await imbpay.createOrder({
    orderId: "order-1",
    amountPaise: 10000,
    mobile: "9876543210",
    redirectUrl: "https://example.test/wallet",
    remark1: "customer@example.test",
    remark2: "wallet deposit",
  });

  const body = new URLSearchParams(request.options.body);
  assert.equal(request.url, "https://api.imbpay.in/v2/create-order");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(body.get("user_token"), "test-imb-token");
  assert.equal(body.get("customer_mobile"), "9876543210");
  assert.equal(body.get("amount"), "100");
  assert.equal(body.get("order_id"), "order-1");
  assert.equal(body.get("redirect_url"), "https://example.test/wallet");
  assert.deepEqual(order, {
    paymentUrl: "https://checkout.example/pay/order-1",
    checkLink: "https://check.example/order-1",
  });
});

test("checkOrderStatus follows the documented success criteria and parses amount in paise", async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      status: "COMPLETED",
      message: "Transaction Successfully",
      result: {
        txnStatus: "COMPLETED",
        status: "SUCCESS",
        amount: 1.5,
        utr: 123456789012,
        payer_name: "Test Payer",
        payer_vpa: "payer@upi",
        payer_app: "UPI",
      },
    }));
  };

  const status = await imbpay.checkOrderStatus("order-1");
  const body = new URLSearchParams(request.options.body);
  assert.equal(request.url, "https://api.imbpay.in/v2/check-order-status");
  assert.equal(body.get("user_token"), "test-imb-token");
  assert.equal(body.get("order_id"), "order-1");
  assert.deepEqual(status, {
    state: "success",
    txnStatus: "COMPLETED",
    amountPaise: 150,
    utr: "123456789012",
    payerName: "Test Payer",
    payerVpa: "payer@upi",
    payerApp: "UPI",
    message: "Transaction Successfully",
  });
});

test("checkOrderStatus does not treat a non-success response as a successful payment", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "COMPLETED",
    result: { txnStatus: "COMPLETED", status: "PENDING", amount: 100 },
  }));

  const status = await imbpay.checkOrderStatus("order-2");
  assert.equal(status.state, "pending");
});
