import { AppError } from "@lpludo/shared";
import { env } from "../config/env.js";
import { redis } from "../db/redis.js";
import { log } from "../config/logger.js";

const l = log("imbpay");
const GATEWAY_DOWN_KEY = "imb:gateway_down";
const GATEWAY_DOWN_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 10_000;

function endpoint(path) {
  return `${env.IMB_API_URL.replace(/\/+$/, "")}/v2/${path}`;
}

function formBody(fields) {
  return new URLSearchParams(
    Object.entries(fields).map(([key, value]) => [key, String(value)])
  ).toString();
}

async function postForm(path, fields) {
  let response;
  try {
    response = await fetch(endpoint(path), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: formBody(fields),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError";
    throw new AppError(
      timedOut ? "IMB Payment request timed out." : "Could not connect to IMB Payment.",
      {
        status: 502,
        code: "GATEWAY_UNAVAILABLE",
        details: { reason: err?.message },
      }
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new AppError(
      payload?.message || `IMB Payment returned HTTP ${response.status}.`,
      { status: 502, code: "GATEWAY_ERROR", details: { httpStatus: response.status } }
    );
  }
  return payload;
}

function amountToPaise(amount) {
  if (amount === null || amount === undefined || !/^\d+(?:\.\d{1,2})?$/.test(String(amount))) {
    return null;
  }
  const [rupees, fraction = ""] = String(amount).split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function isGatewayEnabled() {
  return Boolean(env.IMB_API_TOKEN);
}

export async function isGatewayUsable() {
  if (!isGatewayEnabled()) return false;
  return !(await redis.exists(GATEWAY_DOWN_KEY));
}

export async function gatewayDownReason() {
  if (!isGatewayEnabled()) return "IMB Payment API token is not configured";
  if (await redis.exists(GATEWAY_DOWN_KEY)) return "IMB Payment recently refused an order; retry shortly";
  return null;
}

export async function createOrder({ orderId, amountPaise, mobile, redirectUrl, remark1 = "", remark2 = "" }) {
  if (!isGatewayEnabled()) {
    throw new AppError("IMB Payment is not configured.", { status: 503, code: "GATEWAY_DISABLED" });
  }

  const payload = await postForm("create-order", {
    customer_mobile: mobile,
    user_token: env.IMB_API_TOKEN,
    amount: amountPaise / 100,
    order_id: orderId,
    redirect_url: redirectUrl,
    remark1,
    remark2,
  });

  if (payload?.status !== true) {
    const message = payload?.message || "IMB Payment refused the order.";
    await redis.set(GATEWAY_DOWN_KEY, "1", "EX", GATEWAY_DOWN_SECONDS);
    l.warn({ message }, "gateway refused a create-order request; opening short circuit");
    throw new AppError(message, { status: 502, code: "GATEWAY_ORDER_FAILED" });
  }

  const result = payload.result;
  if (!result || typeof result.payment_url !== "string" || !result.payment_url) {
    throw new AppError("IMB Payment returned an invalid create-order response.", {
      status: 502,
      code: "GATEWAY_INVALID_RESPONSE",
    });
  }

  return { paymentUrl: result.payment_url, checkLink: result.check_link || null };
}

export async function checkOrderStatus(orderId) {
  if (!isGatewayEnabled()) {
    throw new AppError("IMB Payment is not configured.", { status: 503, code: "GATEWAY_DISABLED" });
  }

  const payload = await postForm("check-order-status", {
    user_token: env.IMB_API_TOKEN,
    order_id: orderId,
  });
  const result = payload?.result || {};
  const topStatus = String(payload?.status || "").toUpperCase();
  const transactionStatus = String(result.txnStatus || "").toUpperCase();
  const resultStatus = String(result.status || "").toUpperCase();
  const amountPaise = amountToPaise(result.amount);

  if (topStatus === "COMPLETED" && resultStatus === "SUCCESS") {
    return {
      state: "success",
      txnStatus: transactionStatus || topStatus,
      amountPaise,
      utr: result.utr == null ? null : String(result.utr),
      payerName: result.payer_name || null,
      payerVpa: result.payer_vpa || null,
      payerApp: result.payer_app || null,
      message: payload.message || null,
    };
  }

  if (["FAILED", "CANCELLED", "EXPIRED"].includes(topStatus) || ["FAILED", "CANCELLED", "EXPIRED"].includes(resultStatus)) {
    return {
      state: "failed",
      txnStatus: transactionStatus || topStatus || resultStatus,
      amountPaise,
      utr: result.utr == null ? null : String(result.utr),
      message: payload.message || result.resultInfo || "Payment failed or expired",
    };
  }

  return {
    state: "pending",
    txnStatus: transactionStatus || topStatus || "PENDING",
    amountPaise,
    utr: result.utr == null ? null : String(result.utr),
    message: payload.message || null,
  };
}
