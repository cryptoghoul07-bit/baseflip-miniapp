import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'referral_data.json');

interface ReferralData {
    referrals: Record<string, string[]>; // referrer -> referees
    referrers: Record<string, string>;   // referee -> referrer
}

function readDB(): ReferralData {
    try {
        if (!fs.existsSync(DB_PATH)) {
            return { referrals: {}, referrers: {} };
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading referral DB:', error);
        return { referrals: {}, referrers: {} };
    }
}

function writeDB(data: ReferralData) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing referral DB:', error);
    }
}

export function recordReferral(referrer: string, referee: string): boolean {
    const db = readDB();
    const lowReferrer = referrer.toLowerCase();
    const lowReferee = referee.toLowerCase();

    if (lowReferrer === lowReferee) return false;
    if (db.referrers[lowReferee]) return false; // Already referred

    db.referrers[lowReferee] = lowReferrer;
    if (!db.referrals[lowReferrer]) {
        db.referrals[lowReferrer] = [];
    }
    if (!db.referrals[lowReferrer].includes(lowReferee)) {
        db.referrals[lowReferrer].push(lowReferee);
    }

    writeDB(db);
    return true;
}

export function getReferralStats(address: string) {
    const db = readDB();
    const lowAddress = address.toLowerCase();
    return {
        referralCount: db.referrals[lowAddress]?.length || 0,
        refereeList: db.referrals[lowAddress] || [],
        referredBy: db.referrers[lowAddress] || null
    };
}

export function getRawReferrals(): Record<string, string[]> {
    const db = readDB();
    return db.referrals;
}

export function getAllReferralPoints(): Record<string, number> {
    const db = readDB();
    const points: Record<string, number> = {};

    // Each qualified referral gives 5 points to the referrer
    // Note: Qualifications checked on frontend/leaderboard level currently
    Object.entries(db.referrals).forEach(([referrer, referees]) => {
        points[referrer] = (referees.length || 0) * 5;
    });

    return points;
}
