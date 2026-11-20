// A demo's starting point and reset (src/lib/demo/reset.ts), by hand:
//   npm run demo -- save     this site as it is now becomes the starting point every reset returns to
//   npm run demo -- reset    back to the starting point now: what visitors made, their uploads and accounts go
// On the deployed site, with CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID and the STORAGE_*
// variables set (CORE.md, Media and Database access). `reset` deletes every account but admins', so it
// runs only with DEMO_MODE=1 in the environment, as the demo's Worker has it.
import { resetDemo, saveDemoStart } from '../src/lib/demo/reset';
import { isDemo } from '../src/lib/env';
import { closeLocalBindings } from '../src/lib/local-bindings';

const command = process.argv[2];
try {
  if (command === 'save') console.log(`Starting point saved: ${await saveDemoStart()}`);
  else if (command === 'reset') {
    if (!isDemo()) throw new Error('Set DEMO_MODE=1 to reset: a reset deletes every account but admins’.');
    console.log(await resetDemo());
  } else throw new Error('Usage: npm run demo -- save | reset');
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await closeLocalBindings();
}
