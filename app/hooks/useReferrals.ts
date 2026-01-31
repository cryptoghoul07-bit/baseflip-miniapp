import { useState, useEffect, useCallback } from 'react';

export function useReferrals(address: string | undefined) {
    const [referralCount, setReferralCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const fetchStats = useCallback(async () => {
        if (!address) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/referrals?address=${address}`);
            const data = await res.json();
            if (data.referralCount !== undefined) {
                setReferralCount(data.referralCount);
            }
        } catch (error) {
            console.error('Error fetching referral stats:', error);
        } finally {
            setIsLoading(false);
        }
    }, [address]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const recordReferral = async (referrer: string, referee: string) => {
        try {
            await fetch('/api/referrals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ referrer, referee })
            });
            fetchStats();
        } catch (error) {
            console.error('Error recording referral:', error);
        }
    };

    const getReferralLink = () => {
        if (!address) return '';
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        return `${baseUrl}?ref=${address}`;
    };

    return {
        referralCount,
        referralPoints: referralCount * 5,
        isLoading,
        getReferralLink,
        recordReferral,
        refetch: fetchStats
    };
}
