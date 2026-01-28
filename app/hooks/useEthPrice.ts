import { useState, useEffect } from 'react';

export function useEthPrice() {
    const [price, setPrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPrice = async () => {
            try {
                // Fetch from internal API to avoid CORS/Network issues
                const res = await fetch('/api/eth-price');
                if (!res.ok) throw new Error('API failed');

                const data = await res.json();
                if (data?.data?.amount) {
                    setPrice(parseFloat(data.data.amount));
                }
            } catch (error) {
                // Silently fail on error to simply not show the USD value
                // console.error('Failed to fetch ETH price', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPrice();

        // Refresh every 60 seconds
        const interval = setInterval(fetchPrice, 60000);
        return () => clearInterval(interval);
    }, []);

    const convertEthToUsd = (ethAmount: string | number) => {
        if (!price || !ethAmount) return null;
        const eth = typeof ethAmount === 'string' ? parseFloat(ethAmount) : ethAmount;
        if (isNaN(eth)) return null;

        const usd = eth * price;

        // Format nicely: $1,234.56 or $0.12
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(usd);
    };

    return { price, loading, convertEthToUsd };
}
