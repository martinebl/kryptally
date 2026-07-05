import { describe, it, expect } from 'vitest';
import { costBasisMethodDescriptions } from '$lib/rules/cost-basis-methods';
import type { CostBasisMethod } from '$lib/types/tax-rules';

describe('costBasisMethodDescriptions', () => {
  const methods: CostBasisMethod[] = ['fifo', 'lifo', 'hifo', 'average'];

  it('has a one-sentence description for every cost-basis method', () => {
    methods.forEach((method) => {
      const description = costBasisMethodDescriptions[method];
      expect(description).toBeTruthy();
      expect(description.trim().endsWith('.')).toBe(true);
      expect(description.split('.').filter(Boolean).length).toBe(1);
    });
  });
});
