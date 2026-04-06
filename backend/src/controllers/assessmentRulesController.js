import AssessmentRule from '../models/AssessmentRule.js';

const normalizeBlocks = (blocks = []) => {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block) => ({
      type: block?.type === 'paragraph' ? 'paragraph' : 'bullet',
      text: (block?.text ?? '').toString().trim(),
    }))
    .filter((block) => block.text.length > 0);
};

export async function getAssessmentRules(req, res) {
  try {
    const rules = await AssessmentRule.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();
    return res.json({ rules: rules || null });
  } catch (err) {
    console.error('Error fetching assessment rules:', err);
    return res.status(500).json({ error: 'Failed to fetch assessment rules' });
  }
}

export async function upsertAssessmentRules(req, res) {
  try {
    const { title, blocks } = req.body || {};
    const normalizedBlocks = normalizeBlocks(blocks);
    if (normalizedBlocks.length === 0) {
      return res.status(400).json({ error: 'Rules content is required.' });
    }

    const rules = await AssessmentRule.findOneAndUpdate(
      { isActive: true },
      {
        $set: {
          title: title || 'Assessment Rules',
          blocks: normalizedBlocks,
          isActive: true,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ rules });
  } catch (err) {
    console.error('Error saving assessment rules:', err);
    return res.status(500).json({ error: 'Failed to save assessment rules' });
  }
}
