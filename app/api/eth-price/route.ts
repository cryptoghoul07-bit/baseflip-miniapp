import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const res = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', {
            headers: {
                'Content-Type': 'application/json',
            },
            next: { revalidate: 60 } // Cache for 60 seconds
        });

        if (!res.ok) {
            throw new Error(`External API failed: ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('ETH Price API Error:', error.message);
        return NextResponse.json(
            { error: 'Failed to fetch price', details: error.message },
            { status: 500 }
        );
    }
}
