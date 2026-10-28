import { NextResponse } from 'next/server';
export async function POST() { return NextResponse.json({ error: { code: 'REGISTRATION_CLOSED', message: 'Akun dibuat melalui undangan pengelola. Penonton tidak memerlukan akun.' } }, { status: 403 }); }
