import AssessmentRule from '../models/AssessmentRule.js';
import { logActivity } from './adminActivityController.js';

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

    const before = await AssessmentRule.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();

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

    const changes = {};
    if ((before?.title || '') !== (rules?.title || '')) changes.title = { from: before?.title ?? null, to: rules?.title ?? null };
    if (JSON.stringify(before?.blocks || []) !== JSON.stringify(rules?.blocks || [])) {
      changes.blocks = {
        from: Array.isArray(before?.blocks) ? before.blocks.length : 0,
        to: Array.isArray(rules?.blocks) ? rules.blocks.length : 0,
      };
    }

    logActivity({
      userEmail: req.user?.email,
      userRole: req.user?.role,
      actionType: before ? 'UPDATE' : 'CREATE',
      targetType: 'ASSESSMENT_RULE',
      targetId: rules?._id ? String(rules._id) : null,
      description: `${before ? 'Updated' : 'Created'} assessment rules`,
      changes: Object.keys(changes).length ? changes : null,
      metadata: { rulesId: rules?._id ? String(rules._id) : null },
      req,
    });

    return res.json({ rules });
  } catch (err) {
    console.error('Error saving assessment rules:', err);
    return res.status(500).json({ error: 'Failed to save assessment rules' });
  }
}
