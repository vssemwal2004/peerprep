import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveLegacyImageAlt, fillMissingImageAlt } from '../scripts/lib/hf-content/legacyImageAltText.js';

test('derives placement-aware alt text', () => {
  assert.equal(deriveLegacyImageAlt({ title: 'Two Sum', section: 'description' }), 'Two Sum description diagram');
  assert.equal(deriveLegacyImageAlt({ title: 'Grid Path', section: 'constraints' }), 'Grid Path constraints diagram');
  assert.equal(deriveLegacyImageAlt({ title: 'Tree View', owner: 'sample', samplePosition: 2 }), 'Tree View example 2 diagram');
});

test('fills only missing alt text and preserves all other image fields', () => {
  const original = [
    { url: 'https://managed/one.png', sourceUrl: 'https://source/one.png', caption: 'Keep me', alt: '' },
    { url: 'https://managed/two.png', sourceUrl: 'https://source/two.png', caption: 'Keep too', alt: 'Existing label' },
  ];
  const result = fillMissingImageAlt(original, { title: 'Matrix', owner: 'sample', samplePosition: 3 });
  assert.equal(result.changed, 1);
  assert.deepEqual(result.images, [
    { url: 'https://managed/one.png', sourceUrl: 'https://source/one.png', caption: 'Keep me', alt: 'Matrix example 3 diagram' },
    original[1],
  ]);
  assert.equal(original[0].alt, '');
});

