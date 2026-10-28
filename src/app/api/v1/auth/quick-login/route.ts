import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { AUTH_CONFIG, generateToken } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";

/** Temporary, explicitly enabled access for the local preview. Account is server-selected. */
export async function POST(request: NextRequest) {
  try {
    if (process.env.TEMPORARY_BUTTON_LOGIN !== "true") {
      throw AppError.notFound("Akses sementara tidak aktif");
    }
    const origin = request.headers.get("origin");
    // NextURL normalizes loopback IPs to localhost. Preserve the browser's
    // actual authority, including its port, for the same-origin check.
    const host = request.headers.get("host");
    const expectedOrigin = host
      ? `${request.nextUrl.protocol}//${host}`
      : request.nextUrl.origin;
    if (
      (origin && origin !== expectedOrigin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      throw AppError.forbidden("Permintaan harus berasal dari aplikasi ini");
    }
    const email = process.env.TEMPORARY_LOGIN_EMAIL?.trim().toLowerCase();
    if (!email)
      throw AppError.badRequest("Akun pengelola sementara belum diatur");
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user?.isActive || !["SUPER_ADMIN", "ORGANIZER"].includes(user.role)) {
      throw AppError.forbidden("Akun pengelola sementara tidak tersedia");
    }
    const response = NextResponse.json({ data: { user } });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set({
      name: AUTH_CONFIG.COOKIE_NAME,
      value: generateToken({ userId: user.id, role: user.role }),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
