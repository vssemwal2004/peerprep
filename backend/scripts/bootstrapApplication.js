import '../src/setup.js';
import { connectDb, closeDb } from '../src/utils/db.js';
import { closeValkeyClient } from '../src/utils/valkey.js';
import { seedAdminIfNeeded } from '../src/controllers/authController.js';
import { seedEmailTemplates } from '../src/services/emailTemplateService.js';
import { seedDefaultMasterData } from '../src/services/masterDataService.js';

// Run explicitly once per installation/deployment, never per API replica.
try {
  await connectDb();
  await seedAdminIfNeeded();
  await seedEmailTemplates();
  await seedDefaultMasterData();
  console.log('Application bootstrap completed.');
} catch (error) {
  console.error(`Application bootstrap failed (${error.code || error.name}).`);
  process.exitCode = 1;
} finally {
  await closeValkeyClient();
  await closeDb();
}
