export interface Env {
  DB: D1Database;
  MAIL_FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_NAME: string;
  SESSION_DAYS: string;
  INVITE_DAYS: string;
  ALLOW_BOOTSTRAP: string;
  BOOTSTRAP_SECRET: string;
  MAX_ATTACHMENT_BYTES: string;
}
export interface AuthUser {
  id: string;
  email_alias: string;
  display_name: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  district_code?: string | null;
}
export interface SessionContext { user: AuthUser; tokenHash: string; }