import type { CatalogExport, CatalogGame } from '../../db/export-catalog';

export interface ConciergeAnswer {
    message: string;
    recommendations: CatalogGame[];
}

const STOP_WORDS = new Set([
    'a',
    'about',
    'and',
    'any',
    'are',
    'best',
    'can',
    'could',
    'do',
    'for',
    'game',
    'games',
    'good',
    'have',
    'i',
    'in',
    'is',
    'it',
    'looking',
    'me',
    'of',
    'on',
    'or',
    'please',
    'recommend',
    'recommendation',
    'recommendations',
    'show',
    'some',
    'tell',
    'the',
    'to',
    'what',
    'which',
    'with',
    'would',
    'you',
]);

const UNSUPPORTED_FACTS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\b(?:funding|funded|raised|raising|campaign totals?|pledges?)\b/i, label: 'funding totals and pledge tiers' },
    { pattern: /\bbacker counts?\b|\bhow many backers\b|\bnumber of backers\b/i, label: 'backer counts' },
    { pattern: /\bplayer counts?\b|\bhow many players\b|\bnumber of players\b/i, label: 'player counts' },
    { pattern: /\bprices?\b|\bcosts?\b|\bhow much\b/i, label: 'prices' },
    { pattern: /\brelease dates?\b|\blaunch dates?\b|\bwhen (?:will|does) .{0,40}\b(?:release|launch)\b/i, label: 'release dates' },
];

const GIT_TERMS = ['repository', 'branch', 'commit', 'merge', 'conflict', 'pull', 'request'];
const PUN_TERMS = ['branch', 'commit', 'merge', 'conflict'];
const RANKING_QUESTION = /\b(?:highest|top|best|most)\b.*\b(?:rated|rating|stars?)\b|\b(?:rated|rating|stars?)\b.*\b(?:highest|top|best|most)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isCatalogGame(value: unknown): value is CatalogGame {
    if (!isRecord(value)) return false;

    return (
        typeof value.id === 'number' &&
        typeof value.title === 'string' &&
        typeof value.description === 'string' &&
        typeof value.category === 'string' &&
        typeof value.publisher === 'string' &&
        (value.starRating === undefined || typeof value.starRating === 'number') &&
        typeof value.ratingLabel === 'string'
    );
}

/** Validate the generated catalog before using it in the browser. */
export function isCatalogExport(value: unknown): value is CatalogExport {
    if (!isRecord(value)) return false;

    return (
        typeof value.source === 'string' &&
        typeof value.note === 'string' &&
        typeof value.gameCount === 'number' &&
        Array.isArray(value.categories) &&
        value.categories.every((category: unknown) => typeof category === 'string') &&
        Array.isArray(value.publishers) &&
        value.publishers.every((publisher: unknown) => typeof publisher === 'string') &&
        Array.isArray(value.games) &&
        value.games.every(isCatalogGame)
    );
}

function requestedCategories(question: string, categories: string[]): string[] {
    const normalizedQuestion = question.toLocaleLowerCase();
    return categories.filter((category) => {
        const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escapedCategory}\\b`, 'i').test(normalizedQuestion);
    });
}

function searchTerms(question: string): string[] {
    const words = question.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const terms = new Set(words.filter((word) => word.length > 2 && !STOP_WORDS.has(word)));

    if (/\bgit\b/i.test(question)) {
        for (const term of GIT_TERMS) terms.add(term);
    }
    if (/\bpuns?\b/i.test(question)) {
        for (const term of PUN_TERMS) terms.add(term);
    }

    return [...terms];
}

function clarification(message: string): ConciergeAnswer {
    return { message, recommendations: [] };
}

function formatList(values: string[]): string {
    if (values.length < 2) return values[0] ?? '';
    return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

function rankGames(games: CatalogGame[], categories: string[]): ConciergeAnswer {
    const eligibleGames = games.filter(
        (game) =>
            game.starRating !== undefined &&
            (categories.length === 0 || categories.includes(game.category)),
    );

    if (eligibleGames.length === 0) {
        const scope = categories.length > 0 ? ` in ${formatList(categories)}` : '';
        return clarification(
            `The catalog has no star ratings${scope} to compare. Which category or game style should I look for instead?`,
        );
    }

    const highestRating = Math.max(...eligibleGames.map((game) => game.starRating ?? 0));
    const recommendations = eligibleGames
        .filter((game) => game.starRating === highestRating)
        .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : a.id - b.id))
        .slice(0, 3);
    const scope = categories.length > 0 ? ` ${formatList(categories)}` : '';

    return {
        message: `The highest-rated${scope} game${categories.length > 0 ? '' : 's'} in the catalog:`,
        recommendations,
    };
}

/** Answer catalog questions using only exported Tailspin game data. */
export function answerCatalogQuestion(question: string, catalog: CatalogExport): ConciergeAnswer {
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
        return clarification('What category, theme, or game style are you interested in?');
    }

    const unavailableFacts = UNSUPPORTED_FACTS
        .filter(({ pattern }) => pattern.test(trimmedQuestion))
        .map(({ label }) => label);
    if (unavailableFacts.length > 0) {
        return clarification(
            `The catalog does not track ${formatList(unavailableFacts)}, so I can’t answer that. Which category or play style should I use to recommend a game?`,
        );
    }

    const categories = requestedCategories(trimmedQuestion, catalog.categories);
    if (RANKING_QUESTION.test(trimmedQuestion)) {
        return rankGames(catalog.games, categories);
    }

    const terms = searchTerms(trimmedQuestion);
    const matchingGames = catalog.games
        .map((game) => {
            const title = game.title.toLocaleLowerCase();
            const category = game.category.toLocaleLowerCase();
            const publisher = game.publisher.toLocaleLowerCase();
            const description = game.description.toLocaleLowerCase();
            const score = terms.reduce(
                (total, term) =>
                    total +
                    (new RegExp(`\\b${term}\\b`, 'i').test(title) ? 4 : 0) +
                    (new RegExp(`\\b${term}\\b`, 'i').test(category) ? 3 : 0) +
                    (new RegExp(`\\b${term}\\b`, 'i').test(publisher) ? 2 : 0) +
                    (new RegExp(`\\b${term}\\b`, 'i').test(description) ? 1 : 0),
                0,
            );

            return { game, score };
        })
        .filter(({ game, score }) => score > 0 && (categories.length === 0 || categories.includes(game.category)))
        .sort((a, b) => b.score - a.score || (a.game.title < b.game.title ? -1 : a.game.title > b.game.title ? 1 : a.game.id - b.game.id))
        .slice(0, 3)
        .map(({ game }) => game);

    if (matchingGames.length === 0) {
        return clarification(
            'I couldn’t find a close match in the catalog. What category, theme, or game style should I look for?',
        );
    }

    return {
        message: 'These are the closest matches in the Tailspin catalog:',
        recommendations: matchingGames,
    };
}
