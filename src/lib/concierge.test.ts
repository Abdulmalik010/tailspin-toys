import { describe, expect, it } from 'vitest';
import { answerCatalogQuestion, isCatalogExport } from './concierge';
import type { CatalogExport, CatalogGame } from '../../db/export-catalog';

const games: CatalogGame[] = [
    {
        id: 1,
        title: 'Merge Conflict Mystery',
        description: 'Resolve code merges and conflicts in this logic puzzle.',
        category: 'Puzzle',
        publisher: 'DevMasters Inc.',
        starRating: 4.4,
        ratingLabel: '★★★★',
    },
    {
        id: 2,
        title: 'Repo Rulers',
        description: 'Manage repositories and protect branches with sharp tactics.',
        category: 'Strategy',
        publisher: 'Ops Interactive',
        starRating: 4.8,
        ratingLabel: '★★★★½',
    },
    {
        id: 3,
        title: 'Server Siege',
        description: 'Coordinate a defense against cyber threats.',
        category: 'Strategy',
        publisher: 'GitHub Games',
        starRating: 4.1,
        ratingLabel: '★★★★',
    },
];

const catalog: CatalogExport = {
    source: 'Tailspin Toys crowdfunding catalog',
    note: 'Catalog facts only.',
    gameCount: games.length,
    categories: ['Puzzle', 'Strategy'],
    publishers: ['DevMasters Inc.', 'GitHub Games', 'Ops Interactive'],
    games,
};

describe('answerCatalogQuestion', () => {
    it('recommends the highest-rated game in the requested category', () => {
        const answer = answerCatalogQuestion('What is the highest-rated strategy game?', catalog);

        expect(answer.recommendations.map((game) => game.title)).toEqual(['Repo Rulers']);
        expect(answer.recommendations[0]?.starRating).toBe(4.8);
    });

    it('matches free-text preferences to catalog descriptions without inventing facts', () => {
        const answer = answerCatalogQuestion('I like git puns', catalog);

        expect(answer.recommendations[0]?.title).toBe('Merge Conflict Mystery');
        expect(answer.message).toContain('Tailspin catalog');
    });

    it('asks one clarifying question when the request is vague', () => {
        const answer = answerCatalogQuestion('I want a game', catalog);

        expect(answer.recommendations).toEqual([]);
        expect(answer.message.match(/\?/g)).toHaveLength(1);
    });

    it.each([
        ['funding totals', 'How much funding has this game raised?'],
        ['backer counts', 'How many backers does it have?'],
        ['player counts', 'What is the player count?'],
        ['pledge tiers', 'What pledge tiers can I choose?'],
        ['prices', 'What is the price?'],
        ['release dates', 'When is the release date?'],
    ])('does not guess %s and asks a clarifying question', (fact: string, question: string) => {
        const answer = answerCatalogQuestion(question, catalog);

        expect(answer.recommendations).toEqual([]);
        expect(answer.message).toContain(fact);
        expect(answer.message.match(/\?/g)).toHaveLength(1);
    });
});

describe('isCatalogExport', () => {
    it('accepts a generated catalog and rejects malformed data', () => {
        expect(isCatalogExport(catalog)).toBe(true);
        expect(isCatalogExport({ ...catalog, games: ['not a game'] })).toBe(false);
    });
});
