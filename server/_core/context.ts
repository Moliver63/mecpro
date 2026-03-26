import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { jwtVerify } from "jose";
import { ENV } from "./env";
import { getUserById } from "../db";

export async function createContext({ req, res }: CreateExpressContextOptions) {
  let user = null;
  try {
    const token = req.cookies?.token;
    if (token) {
      const secret = new TextEncoder().encode(ENV.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      user = await getUserById(payload.userId as number);
    }
  } catch {}
  return { req, res, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
