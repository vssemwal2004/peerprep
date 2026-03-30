import Semester from '../models/Subject.js';
import { HttpError } from '../utils/errors.js';
import { io } from '../server.js';

// Clean up duplicate semesters for a coordinator
export async function cleanupDuplicateSemesters(req, res) {
  try {
    const coordinatorId = req.user.role === 'coordinator' ? req.user.coordinatorId : req.body.coordinatorId;
    if (!coordinatorId) throw new HttpError(400, 'coordinatorId is required');

    console.log(`\n=== Starting duplicate cleanup for coordinator: ${coordinatorId} ===`);
    
    // Get all semesters for this coordinator
    const semesters = await Semester.find({ coordinatorId }).lean();
    console.log(`Found ${semesters.length} total semesters`);

    // Group by semester name (case-insensitive)
    const semesterGroups = new Map();
    semesters.forEach(sem => {
      const key = sem.semesterName.toLowerCase().trim();
      if (!semesterGroups.has(key)) {
        semesterGroups.set(key, []);
      }
      semesterGroups.get(key).push(sem);
    });

    const results = {
      totalSemesters: semesters.length,
      duplicatesFound: 0,
      duplicatesDeleted: 0,
      errors: []
    };

    // Process each group
    for (const [name, duplicates] of semesterGroups) {
      if (duplicates.length > 1) {
        results.duplicatesFound += duplicates.length - 1;
        console.log(`\nFound ${duplicates.length} duplicates for "${name}"`);
        
        // Sort: Keep the one with most subjects, or most recent if tied
        duplicates.sort((a, b) => {
          const subjectDiff = (b.subjects?.length || 0) - (a.subjects?.length || 0);
          if (subjectDiff !== 0) return subjectDiff;
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        // Keep the first one, delete the rest
        const toKeep = duplicates[0];
        console.log(`  ✓ Keeping: ${toKeep._id} (${toKeep.subjects?.length || 0} subjects)`);

        for (let i = 1; i < duplicates.length; i++) {
          const toDelete = duplicates[i];
          try {
            await Semester.findByIdAndDelete(toDelete._id);
            console.log(`  ✗ Deleted: ${toDelete._id} (${toDelete.subjects?.length || 0} subjects)`);
            results.duplicatesDeleted++;
          } catch (err) {
            console.error(`  ✗ Failed to delete ${toDelete._id}:`, err.message);
            results.errors.push(`Failed to delete ${toDelete._id}: ${err.message}`);
          }
        }
      }
    }

    console.log(`\n=== Cleanup complete ===`);
    console.log(`Duplicates found: ${results.duplicatesFound}`);
    console.log(`Duplicates deleted: ${results.duplicatesDeleted}`);
    console.log(`Errors: ${results.errors.length}`);

    // Emit socket event to refresh UI
    io.emit('learning-updated', { type: 'cleanup-complete', coordinatorId });

    res.json({
      success: true,
      message: `Cleaned up ${results.duplicatesDeleted} duplicate semesters`,
      details: results
    });
  } catch (err) {
    console.error('Error cleaning up duplicates:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: err.message || 'Failed to clean up duplicates' });
  }
}
