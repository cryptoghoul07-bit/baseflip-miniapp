import { NextRequest, NextResponse } from 'next/server';
import { getUserStreak, recordRoundResult, protectStreak, getAllStreaks } from '../../lib/streakDB';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const all = searchParams.get('all');

    if (all === 'true') {
        return NextResponse.json(getAllStreaks());
    }

    if (address) {
        return NextResponse.json(getUserStreak(address));
    }

    return NextResponse.json({ error: 'Address required' }, { status: 400 });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, address, roundId, isWin } = body;

        if (!address || !roundId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        if (action === 'record') {
            const streak = recordRoundResult(address, roundId, isWin);
            return NextResponse.json({ success: true, streak });
        }

        if (action === 'protect') {
            // In a production app, verify the transaction hash or event here
            const success = protectStreak(address, roundId);
            return NextResponse.json({ success });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
