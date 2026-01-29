
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Using Coinbase Public API (No key required for public market data)
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

        // Fallback static price if API fails (approx value)
        return NextResponse.json({
            data: { amount: "3200.00", currency: "USD" }
        });
    }
}
