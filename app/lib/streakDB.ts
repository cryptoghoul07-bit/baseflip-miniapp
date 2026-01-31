import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'streak_data.json');

interface StreakData {
    streaks: Record<string, UserStreak>;
}

interface UserStreak {
    currentStreak: number;
    maxStreak: number;
    lastRoundId: number;
    lastResult: 'win' | 'loss' | null;
    streakAtLoss: number; // Stored to allow restoration
    totalBonusPoints: number; // Cumulative points from streak milestones
    lastUpdate: string; // ISO timestamp
}

function readDB(): StreakData {
    try {
        if (!fs.existsSync(DB_PATH)) {
            return { streaks: {} };
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading streak DB:', error);
        return { streaks: {} };
    }
}

function writeDB(data: StreakData) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing streak DB:', error);
    }
}

export function getUserStreak(address: string) {
    const db = readDB();
    const lowAddress = address.toLowerCase();
    return db.streaks[lowAddress] || {
        currentStreak: 0,
        maxStreak: 0,
        lastRoundId: 0,
        lastResult: null,
        streakAtLoss: 0,
        totalBonusPoints: 0,
        lastUpdate: new Date().toISOString()
    };
}

export function getAllStreaks() {
    return readDB().streaks;
}

export function recordRoundResult(address: string, roundId: number, isWin: boolean) {
    const db = readDB();
    const lowAddress = address.toLowerCase();

    if (!db.streaks[lowAddress]) {
        db.streaks[lowAddress] = {
            currentStreak: 0,
            maxStreak: 0,
            lastRoundId: 0,
            lastResult: null,
            streakAtLoss: 0,
            totalBonusPoints: 0,
            lastUpdate: new Date().toISOString()
        };
    }

    const user = db.streaks[lowAddress];

    // Avoid duplicate processing for same round
    if (user.lastRoundId === roundId) return user;

    user.lastRoundId = roundId;
    user.lastUpdate = new Date().toISOString();
    user.lastResult = isWin ? 'win' : 'loss';

    if (isWin) {
        user.currentStreak += 1;
        if (user.currentStreak > user.maxStreak) {
            user.maxStreak = user.currentStreak;
        }
        user.streakAtLoss = 0; // Reset restored memory

        // Calculate Milestones
        if (user.currentStreak === 2) user.totalBonusPoints = (user.totalBonusPoints || 0) + 1;
        else if (user.currentStreak === 3) user.totalBonusPoints = (user.totalBonusPoints || 0) + 2;
        else if (user.currentStreak === 5) user.totalBonusPoints = (user.totalBonusPoints || 0) + 5;
        else if (user.currentStreak > 5 && user.currentStreak % 5 === 0) user.totalBonusPoints = (user.totalBonusPoints || 0) + 5;

    } else {
        // Loss: Save state for potential protection
        user.streakAtLoss = user.currentStreak;
        user.currentStreak = 0;
    }

    writeDB(db);
    return user;
}

export function protectStreak(address: string, roundId: number) {
    const db = readDB();
    const lowAddress = address.toLowerCase();
    const user = db.streaks[lowAddress];

    if (!user) return false;

    // Can only protect if the last recorded round was a loss AND it matches the protected round ID
    if (user.lastResult === 'loss' && user.lastRoundId === roundId && user.streakAtLoss > 0) {
        user.currentStreak = user.streakAtLoss;
        user.streakAtLoss = 0; // Consumed
        user.lastResult = 'win'; // Treat as if it wasn't a streak-breaking loss (semantically)
        writeDB(db);
        return true;
    }

    return false;
}
