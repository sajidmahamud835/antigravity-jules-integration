/**
 * SIMPLIFIED JULES API TEST
 * Works in any console - just paste and run
 */

(async function () {
    console.log('='.repeat(60));
    console.log('JULES API TEST');
    console.log('='.repeat(60));

    // Get API key from user
    const apiKey = prompt('Paste your Jules API key (from jules.google.com/settings):');

    if (!apiKey || apiKey.trim() === '') {
        console.error('❌ No API key provided');
        console.log('Get your API key from: https://jules.google.com/settings');
        return;
    }

    console.log('✅ API key provided:', apiKey.substring(0, 20) + '...');

    // Test API
    const apiUrl = 'https://jules.googleapis.com/v1alpha/sessions';
    console.log('\nTesting:', apiUrl);

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey
            }
        });

        console.log('Response status:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API ERROR:');
            console.error(errorText);
            return;
        }

        const data = await response.json();
        console.log('\n✅ API call successful!');
        console.log('Response structure:', Object.keys(data));

        const sessions = data.sessions || [];
        console.log('\n📊 SESSIONS FOUND:', sessions.length);

        if (sessions.length === 0) {
            console.warn('⚠️ No sessions returned by API');
            console.log('This could mean:');
            console.log('  1. You haven\'t created any sessions yet');
            console.log('  2. Wrong API key');
            console.log('  3. Sessions exist but not showing up');
        } else {
            console.log('\n✅ Found', sessions.length, 'session(s):');
            sessions.forEach((s, i) => {
                console.log(`\nSession ${i + 1}:`);
                console.log('  ID:', s.name);
                console.log('  Title:', s.title || 'N/A');
                console.log('  State:', s.state || 'N/A');
                console.log('  Created:', s.createTime || 'N/A');
            });
        }

        // Try with pageSize
        console.log('\n🔄 Testing with pageSize=100...');
        const response2 = await fetch(apiUrl + '?pageSize=100', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey
            }
        });

        if (response2.ok) {
            const data2 = await response2.json();
            const sessions2 = data2.sessions || [];
            console.log('✅ With pageSize=100:', sessions2.length, 'sessions');

            if (sessions2.length !== sessions.length) {
                console.warn('⚠️ Different count! Default returned', sessions.length, 'but pageSize=100 returned', sessions2.length);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('TEST COMPLETE');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('Full error:', error);
    }
})();
