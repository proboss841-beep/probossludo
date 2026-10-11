import { randomBytes, randomInt } from "crypto";
import { env, isTest } from "../config/env.js";
import { log } from "../config/logger.js";
import { AppError, BadRequestError, TooManyRequestsError } from "@lpludo/shared";

const l = log("otp");

let client;
export function otpStoreInit(redisClient) {
  client = redisClient;
}

const SEND_LIMIT_KEY = (phone) => `otp:send:${phone}`;
const ATTEMPT_KEY = (phone) => `otp:att:${phone}`;
const VERIFY_LIMIT_KEY = (phone) => `otp:verify:${phone}`;
const MESSAGE_ID_KEY = (phone) => `otp:message:${phone}`;

const OTP_TTL_SECONDS = 600;

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return digits.slice(-10);
}

async function sendOtpViaMeraOtp(phone) {
  if (!env.MERAOTP_API_URL || !env.MERAOTP_API_KEY) {
    return false;
  }

  const mobile = normalizePhone(phone);
  const idempotencyKey = `otp_${randomBytes(16).toString("hex")}`;

  const body = {
    mobile,
    purpose: "login",
    otp_length: 6,
    reference: `login_${mobile}`,
  };

  let response;
  try {
    response = await fetch(env.MERAOTP_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MERAOTP_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    const message = err?.name === "TimeoutError"
      ? "MeraOTP request timed out."
      : "Could not connect to MeraOTP.";
    throw new AppError(message, {
      status: 502,
      code: "SMS_PROVIDER_UNAVAILABLE",
      details: { reason: err?.message },
    });
  }

  const rawText = await response.text();
  let parsed;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { raw: rawText };
  }

  if (!response.ok || parsed?.success !== true) {
    const providerMessage = parsed?.message || parsed?.error?.message;
    throw new AppError(
      providerMessage
        ? `MeraOTP rejected the OTP request: ${providerMessage}`
        : `MeraOTP rejected the OTP request (HTTP ${response.status}).`,
      {
        status: 502,
        code: "SMS_PROVIDER_ERROR",
        details: { httpStatus: response.status, response: parsed },
      }
    );
  }

  l.info(
    { phone, provider: "MeraOTP", messageId: parsed?.data?.message_id },
    "OTP request accepted by provider"
  );
  const messageId = parsed?.data?.message_id;
  if (typeof messageId !== "string" || !messageId) {
    throw new AppError("MeraOTP accepted the request but did not return a message ID.", {
      status: 502,
      code: "SMS_PROVIDER_ERROR",
    });
  }
  return messageId;
}

async function verifyOtpViaMeraOtp(messageId, otp) {
  let response;
  try {
    response = await fetch(env.MERAOTP_VERIFY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MERAOTP_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ message_id: messageId, otp }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    const message = err?.name === "TimeoutError"
      ? "MeraOTP verification request timed out."
      : "Could not connect to MeraOTP to verify the OTP.";
    throw new AppError(message, {
      status: 502,
      code: "SMS_PROVIDER_UNAVAILABLE",
      details: { reason: err?.message },
    });
  }

  let parsed;
  try {
    parsed = await response.json();
  } catch {
    parsed = {};
  }

  if (response.ok && parsed?.success === true) {
    return parsed?.data?.verified === true;
  }

  if (response.status === 400 || response.status === 422) {
    throw new BadRequestError("OTP is incorrect or expired. Please request a new OTP.");
  }

  throw new AppError("MeraOTP could not verify the OTP. Please try again.", {
    status: 502,
    code: "SMS_PROVIDER_ERROR",
    details: { httpStatus: response.status },
  });
}

export async function createOtp(phone) {
  const providerConfigured = Boolean(env.MERAOTP_API_URL && env.MERAOTP_API_KEY);
  if (env.NODE_ENV === "production" && !providerConfigured) {
    throw new AppError("OTP delivery is not configured for production.", {
      status: 503,
      code: "SMS_NOT_CONFIGURED",
    });
  }

  const sendHour = await client.incr(SEND_LIMIT_KEY(phone));
  if (sendHour === 1) await client.expire(SEND_LIMIT_KEY(phone), 3600);
  if (sendHour > 5) {
    await client.decr(SEND_LIMIT_KEY(phone));
    throw new TooManyRequestsError("Too many OTP requests. Try again later.");
  }

  const cooldownSet = await client.set(`otp:last:${phone}`, "1", "EX", 60, "NX");
  if (!cooldownSet) {
    await client.decr(SEND_LIMIT_KEY(phone));
    throw new TooManyRequestsError("Please wait a minute before requesting another OTP");
  }

  try {
    if (providerConfigured) {
      await client.del(`otp:code:${phone}`, MESSAGE_ID_KEY(phone), ATTEMPT_KEY(phone), VERIFY_LIMIT_KEY(phone));
      const messageId = await sendOtpViaMeraOtp(phone);
      await client.set(MESSAGE_ID_KEY(phone), messageId, "EX", OTP_TTL_SECONDS);
      l.info({ phone }, "OTP request sent via MeraOTP provider");
      return { sent: true };
    }

    const code = String(randomInt(100000, 1000000));
    await client.set(`otp:code:${phone}`, code, "EX", OTP_TTL_SECONDS);
    await client.del(ATTEMPT_KEY(phone));
    l.warn({ phone }, "Offline OTP mode enabled — code is generated locally");
    l.info({ phone, otp: code }, "OTP generated for local/offline build");
    return { sent: true, devOtp: isTest ? undefined : code };
  } catch (err) {
    try {
      await client.decr(SEND_LIMIT_KEY(phone));
      await client.del(`otp:last:${phone}`);
    } catch (cleanupError) {
      l.error({ phone, err: cleanupError }, "Failed to release OTP rate-limit reservation");
    }
    throw err;
  }
}

export async function verifyOtp(phone, otp) {
  const attempts = await client.incr(VERIFY_LIMIT_KEY(phone));
  if (attempts === 1) await client.expire(VERIFY_LIMIT_KEY(phone), OTP_TTL_SECONDS);
  if (attempts > 5) throw new TooManyRequestsError("Too many wrong attempts. Request a new OTP.");

  if (env.ALLOW_DEV_OTP && env.DEV_MASTER_OTP && otp === env.DEV_MASTER_OTP) {
    l.warn({ phone }, "DEV_MASTER_OTP used (local development only)");
    return true;
  }

  if (env.MERAOTP_API_KEY) {
    const messageId = await client.get(MESSAGE_ID_KEY(phone));
    if (!messageId) throw new BadRequestError("OTP expired or was never sent. Please request a new OTP.");
    const verified = await verifyOtpViaMeraOtp(messageId, otp);
    if (!verified) throw new BadRequestError("OTP is incorrect or expired. Please request a new OTP.");
    await client.del(MESSAGE_ID_KEY(phone));
  } else {
    const stored = await client.get(`otp:code:${phone}`);
    if (!stored) throw new BadRequestError("OTP expired or was never sent");
    if (otp !== stored) throw new BadRequestError("Incorrect OTP");
    await client.del(`otp:code:${phone}`);
  }
  await client.del(ATTEMPT_KEY(phone));
  await client.del(VERIFY_LIMIT_KEY(phone));
  return true;
}
