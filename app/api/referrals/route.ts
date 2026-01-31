import { NextRequest, NextResponse } from 'next/server';
import { recordReferral, getReferralStats, getAllReferralPoints } from '../../lib/referralDB';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const all = searchParams.get('all');
    const raw = searchParams.get('raw');

    if (all === 'true') {
        const points = getAllReferralPoints();
        return NextResponse.json({ points });
    }

    if (raw === 'true') {
        const referrals = require('../../lib/referralDB').getRawReferrals();
        return NextResponse.json({ referrals });
    }

    if (!address) {
        return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    const stats = getReferralStats(address);
    return NextResponse.json(stats);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { referrer, referee } = body;

        if (!referrer || !referee) {
            return NextResponse.json({ error: 'Referrer and referee required' }, { status: 400 });
        }

        const success = recordReferral(referrer, referee);
        return NextResponse.json({ success });
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 500 });
    }
}
