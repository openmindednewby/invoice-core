import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { expenseInput } from '../testing/expenseFixtures';
import { addCategory, readCategories, renameCategory } from './categories';
import { addExpense, readExpense } from './expenseFolder';

describe('readCategories', () => {
  it('with no categories file, returns the nine starting categories', async () => {
    const storage = createMemoryStorage();

    const categories = await readCategories(storage);

    expect(categories.map((category) => category.name)).toEqual([
      'Travel', 'Fuel and car', 'Software and subscriptions', 'Equipment', 'Office and supplies', 'Meals and entertainment',
      'Phone and internet', 'Professional fees', 'Other',
    ]);
  });
});

describe('addCategory', () => {
  it('with a new name, saves it after the nine with a new id', async () => {
    const storage = createMemoryStorage();
    await addCategory(storage, '  Training courses ');

    const categories = await readCategories(storage);

    expect({ count: categories.length, last: categories[categories.length - 1] }).toEqual({ count: 10, last: { id: 'training-courses', name: 'Training courses' } });
  });

  it('with a blank name or one already in the list, refuses', async () => {
    const storage = createMemoryStorage();

    const refused = await Promise.all([addCategory(storage, '  '), addCategory(storage, 'travel')].map((call) => call.catch((error: Error) => error.message)));

    expect(refused).toEqual(['name: is required', 'name: travel is already a category']);
  });

  it('with a new name expenses can use, files an expense in it', async () => {
    const storage = createMemoryStorage();
    await addCategory(storage, 'Training courses');

    const expense = await addExpense(storage, expenseInput({ category: 'training-courses' }));

    expect(expense.category).toBe('training-courses');
  });
});

describe('renameCategory', () => {
  it('with an expense in the category, renames it and the expense keeps its id', async () => {
    const storage = createMemoryStorage();
    const expense = await addExpense(storage, expenseInput({ category: 'travel' }));

    const categories = await renameCategory(storage, 'travel', 'Trips');

    expect({ renamed: categories[0], kept: (await readExpense(storage, expense.dir)).category }).toEqual({ renamed: { id: 'travel', name: 'Trips' }, kept: 'travel' });
  });
});
