import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type Session = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  userId?: string;
  displayName?: string;
  market?: string;
  /** OAuth CSRF nonce, cleared once the callback consumes it */
  authState?: string;
};

const password = process.env.SESSION_SECRET ?? "";

export const sessionOptions: SessionOptions = {
  password,
  cookieName: "smm_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession() {
  if (password.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters. See .env.example.");
  }
  return getIronSession<Session>(await cookies(), sessionOptions);
}
