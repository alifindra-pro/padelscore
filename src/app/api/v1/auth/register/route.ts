import { NextResponse } from 'next/server';
export async function POST() { return NextResponse.json({ error: { code: 'REGISTRATION_CLOSED', message: 'Akun dibuat oleh admin. Hubungi admin organisasi Anda. Penonton tidak memerlukan akun.' } }, { status: 403 }); }
