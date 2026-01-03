/**
 * JULES API DIAGNOSTIC TEST
 * 
 * Copy this entire script into the browser console (Developer Tools -> Console)
 * It will test the Jules API directly and show you what's happening.
 */

(async function () {
    console.log('='.repeat(60));
    console.log('JULES API DIAGNOSTIC TEST');
    console.log('='.repeat(60));

    // Step 1: Get API key from VS Code API
    console.log('\n[Step 1] Getting API key...');
    let apiKey;
    try {
        const vscode = acquireVsCodeApi();
        const state = vscode.getState();
        apiKey = state?.apiKey;

        if (!apiKey) {
            console.error('❌ NO API KEY FOUND in VS Code state');
            console.log('Please set your API key using the "Set Jules API Key" command');
            return;
        }
        console.log('✅ API key found:', apiKey.substring(0, 20) + '...');
    } catch (error) {
        console.error('❌ Error getting API key:', error);
        console.log('You may need to set your API key first');
        return;
    }

    // Step 2: Test API connectivity
    console.log('\n[Step 2] Testing Jules API connectivity...');
    const apiUrl = 'https://jules.googleapis.com/v1alpha/sessions';
    console.log('URL:', apiUrl);

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
            console.error('❌ API ERROR:', errorText);
            return;
        }

        // Step 3: Parse response
        console.log('\n[Step 3] Parsing API response...');
        const rawText = await response.text();
        console.log('Raw response (first 500 chars):', rawText.substring(0, 500));

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            console.error('❌ Failed to parse JSON:', e);
            return;
        }

        // Step 4: Analyze response structure
        console.log('\n[Step 4] Response structure:');
        console.log('Keys in response:', Object.keys(data));
        console.log('Full response object:', data);

        // Step 5: Extract sessions
        console.log('\n[Step 5] Extracting sessions...');
        let sessions = [];

        if (Array.isArray(data)) {
            sessions = data;
            console.log('✅ Response is array with', sessions.length, 'items');
        } else if (data.sessions) {
            sessions = data.sessions;
            console.log('✅ Found sessions array with', sessions.length, 'items');
        } else if (data.items) {
            sessions = data.items;
            console.log('✅ Found items array with', sessions.length, 'items');
        } else {
            console.warn('⚠️ No sessions found in response');
        }

        // Step 6: Display sessions
        console.log('\n[Step 6] Sessions found:', sessions.length);
        if (sessions.length === 0) {
            console.warn('⚠️ API returned ZERO sessions');
            console.log('This means:');
            console.log('  1. You may not have created any sessions yet, OR');
            console.log('  2. The API key is for a different account, OR');
            console.log('  3. Sessions exist but API is not returning them');
        } else {
            console.log('✅ Found', sessions.length, 'session(s)!');
            sessions.forEach((session, i) => {
                console.log(`\nSession ${i + 1}:`);
                console.log('  Name:', session.name);
                console.log('  Title:', session.title);
                console.log('  State:', session.state);
                console.log('  Created:', session.createTime);
                console.log('  Full object:', session);
            });
        }

        // Step 7: Try with pageSize parameter
        console.log('\n[Step 7] Testing with pageSize=100...');
        const url2 = apiUrl + '?pageSize=100';
        console.log('URL:', url2);

        const response2 = await fetch(url2, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey
            }
        });

        if (response2.ok) {
            const data2 = await response2.json();
            const sessions2 = data2.sessions || data2.items || [];
            console.log('✅ With pageSize=100:', sessions2.length, 'sessions');
        }

        console.log('\n' + '='.repeat(60));
        console.log('DIAGNOSTIC TEST COMPLETE');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error);
        console.log('Error details:', error.message);
        console.log('Stack trace:', error.stack);
    }
})();
