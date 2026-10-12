import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),

    MONGO_URI: z
      .string()
      .url()
      .default("mongodb://localhost:27018/lpludo_dev?replicaSet=rs0"),
    REDIS_URL: z.string().default("redis://localhost:6379"),

    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be >= 32 chars").default("local-only-access-secret-change-before-deploy-000000"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be >= 32 chars").default("local-only-refresh-secret-change-before-deploy-000000"),
    JWT_ACCESS_TTL: z.string().default("15m"),
    JWT_REFRESH_TTL: z.string().default("30d"),

    CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:5174"),

    ALLOW_DEV_OTP: z
      .string()
      .default("false")
      .transform((v) => ["1", "true", "yes"].includes(v.toLowerCase())),
    DEV_MASTER_OTP: z.string().regex(/^\d*$/, "DEV_MASTER_OTP must be digits").default(""),

    MERAOTP_API_URL: z.string().trim().default("https://meraotp.in/api/v1/otp/send"),
    MERAOTP_VERIFY_API_URL: z.string().trim().default("https://meraotp.in/api/v1/otp/verify"),
    MERAOTP_API_KEY: z.string().trim().default(""),
    MERAOTP_SENDER_ID: z.string().trim().default(""),
    MERAOTP_TEMPLATE_ID: z.string().trim().default(""),

    PUBLIC_WEB_URL: z.string().url().default("http://localhost:5173"),
    IMB_API_URL: z.string().trim().url().default("https://api.imbpay.in"),
    IMB_API_TOKEN: z.string().trim().default(""),
    IMB_STATUS_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(10_000),
    IMB_ORDER_GRACE_MIN: z.coerce.number().int().min(1).max(120).default(30),

    LOCAL_STORAGE_DIR: z.string().default(".local-storage"),

    CONFLICT_REFUND_HOURS: z.coerce.number().int().min(1).max(72).default(12),

    ADMIN_PHONE: z.string().trim().regex(/^[6-9]\d{9}$/, "ADMIN_PHONE must be a 10-digit Indian mobile").optional(),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    ADMIN_NAME: z.string().default("Main Admin"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (env.ALLOW_DEV_OTP) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ALLOW_DEV_OTP"], message: "ALLOW_DEV_OTP cannot be true in production" });
      }
      if (env.DEV_MASTER_OTP) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["DEV_MASTER_OTP"], message: "DEV_MASTER_OTP must be empty in production" });
      }
      if (
        env.JWT_ACCESS_SECRET.startsWith("replace-me") ||
        env.JWT_REFRESH_SECRET.startsWith("replace-me") ||
        env.JWT_ACCESS_SECRET.startsWith("local-only-") ||
        env.JWT_REFRESH_SECRET.startsWith("local-only-")
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_ACCESS_SECRET"], message: "secrets must be changed from the example values" });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "Invalid environment:\n" +
      parsed.error.issues.map((i) => ` - ${i.path.join(".")}: ${i.message}`).join("\n")
  );
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
export const isDev = env.NODE_ENV === "development";

export const corsOrigins = [
  ...new Set([
    ...env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    "https://probossludo.com",
  ]),
];
