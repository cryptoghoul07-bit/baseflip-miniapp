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

        console.log('[API] Referral POST request:', { referrer, referee });

        if (!referrer || !referee) {
            console.log('[API] Referral rejected: Missing data');
            return NextResponse.json({ error: 'Referrer and referee required' }, { status: 400 });
        }

        const success = recordReferral(referrer, referee);

        if (success) {
            console.log('[API] Referral recorded successfully');
            return NextResponse.json({ success: true, message: 'Referral recorded' });
        } else {
            console.log('[API] Referral not recorded (duplicate or self-referral)');
            return NextResponse.json({ success: false, message: 'Referral not recorded' });
        }
    } catch (error) {
        console.error('[API] Referral error:', error);
        return NextResponse.json({ error: 'Invalid request' }, { status: 500 });
    }
}
