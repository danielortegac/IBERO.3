
import fetch from 'node-fetch';

async function test() {
  try {
    const v = await fetch('http://localhost:3000/api/version');
    const vJson = await v.json();
    console.log('VERSION_RESULT:', JSON.stringify(vJson, null, 2));

    const h = await fetch('http://localhost:3000/api/health/gemini');
    const hJson = await h.json();
    console.log('HEALTH_RESULT:', JSON.stringify(hJson, null, 2));
  } catch (e) {
    console.error('TEST_ERROR:', e.message);
  }
}
test();
