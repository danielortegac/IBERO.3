import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: "invalid",
        to: "test@test.com",
        subject: "test",
        body: "test"
      })
    });
    const data = await res.json();
    console.log("Send API response:", data);
  } catch(e) {
    console.error("Fetch error:", e);
  }
}
test();
