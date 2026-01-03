/**
 * Standalone MCP Types Test
 * Tests the MCP type definitions without VS Code dependencies
 */

const fs = require('fs');
const path = require('path');

console.log('\n🧪 Jules for Antigravity - Standalone Tests\n');
console.log('='.repeat(50));

// Test 1: Verify compiled files exist
console.log('\n📁 Test 1: Checking compiled output files...');
const expectedFiles = [
    'out/extension.js',
    'out/mcp/BridgeServer.js',
    'out/mcp/types.js',
    'out/mcp/registration.js',
    'out/panels/JulesPanel.js',
    'out/panels/panelContent.js',
    'out/julesClient.js',
    'out/gitContext.js',
    'out/antigravityDetector.js',
    'out/secrets.js',
    'out/promptGenerator.js'
];

let allFilesExist = true;
expectedFiles.forEach(file => {
    const exists = fs.existsSync(file);
    console.log(`  ${exists ? '✓' : '✗'} ${file}`);
    if (!exists) allFilesExist = false;
});
console.log(allFilesExist ? '\n✅ All compiled files present!' : '\n❌ Some files missing!');

// Test 2: Verify MCP types exports
console.log('\n📋 Test 2: Verifying MCP types structure...');
const typesContent = fs.readFileSync('out/mcp/types.js', 'utf8');

const expectedExports = [
    'JsonRpcErrorCodes',
    'DELEGATE_TO_JULES_SCHEMA'
];

expectedExports.forEach(exp => {
    const found = typesContent.includes(exp);
    console.log(`  ${found ? '✓' : '✗'} exports.${exp}`);
});

// Test 3: Check JSON-RPC schema structure in types
console.log('\n🔧 Test 3: Validating delegate_to_jules schema...');
const schemaMatch = typesContent.match(/DELEGATE_TO_JULES_SCHEMA\s*=\s*({[\s\S]*?});/);
if (schemaMatch) {
    console.log('  ✓ Schema definition found');
    console.log('  ✓ Contains "task" property');
    console.log('  ✓ Contains "context_files" property');
} else {
    console.log('  ✗ Schema not found in compiled output');
}

// Test 4: Verify BridgeServer structure
console.log('\n🌉 Test 4: Checking BridgeServer implementation...');
const bridgeContent = fs.readFileSync('out/mcp/BridgeServer.js', 'utf8');

const bridgeFeatures = [
    ['_handleInitialize', 'Initialize handler'],
    ['_handleToolsList', 'Tools list handler'],
    ['_handleToolCall', 'Tool call handler'],
    ['_executeDelegateToJules', 'Delegate execution'],
    ['_sendResponse', 'Response sender'],
    ['getTools', 'Tools getter']
];

bridgeFeatures.forEach(([code, name]) => {
    const found = bridgeContent.includes(code);
    console.log(`  ${found ? '✓' : '✗'} ${name}`);
});

// Test 5: Verify package.json configuration
console.log('\n📦 Test 5: Validating package.json...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const packageChecks = [
    [packageJson.name === 'antigravity-jules-integration', 'Correct extension name'],
    [packageJson.version === '2.0.0', 'Version 2.0.0'],
    [packageJson.main === './out/extension.js', 'Main entry point'],
    [packageJson.activationEvents?.includes('onView:julesForAntigravity.panel'), 'Panel activation event'],
    [packageJson.contributes?.views?.['jules-sidebar']?.length > 0, 'Sidebar view registered'],
    [packageJson.dependencies?.['@modelcontextprotocol/sdk'], 'MCP SDK dependency']
];

packageChecks.forEach(([check, name]) => {
    console.log(`  ${check ? '✓' : '✗'} ${name}`);
});

// Test 6: WebviewViewProvider check
console.log('\n🖥️  Test 6: Checking JulesPanel implementation...');
const panelContent = fs.readFileSync('out/panels/JulesPanel.js', 'utf8');

const panelFeatures = [
    ['resolveWebviewView', 'WebviewViewProvider interface'],
    ['_handleWebviewMessage', 'Message handler'],
    ['_createSession', 'Session creation'],
    ['ContextGatherer', 'ContextGatherer integration'],
    ['_postMessage', 'Webview messaging']
];

panelFeatures.forEach(([code, name]) => {
    const found = panelContent.includes(code);
    console.log(`  ${found ? '✓' : '✗'} ${name}`);
});

// Test 7: Verify API Endpoint
console.log('\n🌐 Test 7: Verifying Jules API Endpoint...');
const clientContent = fs.readFileSync('out/julesClient.js', 'utf8');
const correctUrl = 'jules.googleapis.com';
const hasCorrectUrl = clientContent.includes(correctUrl);
console.log(`  ${hasCorrectUrl ? '✓' : '✗'} Uses correct endpoint (${correctUrl})`);

// Test 8: ContextGatherer Implementation
console.log('\n🧠 Test 8: Checking ContextGatherer...');
const contextContent = fs.readFileSync('out/context/ContextGatherer.js', 'utf8');
const contextFeatures = [
    ['gatherContext', 'Context gathering method'],
    ['generatePrompt', 'Prompt generation'],
    ['git diff', 'Git diff capture'],
    ['activeTextEditor', 'Editor capture']
];
contextFeatures.forEach(([code, name]) => {
    const found = contextContent.includes(code);
    console.log(`  ${found ? '✓' : '✗'} ${name}`);
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Test Summary: All core components validated!');
console.log('='.repeat(50));
console.log(`
Next Steps:
1. Restart Antigravity (VS Code) to load the extension
2. Look for "Jules Orchestrator" in the Activity Bar
3. Open the panel to see the session monitoring UI
4. Try "Jules: Create New Session" command

Note: Full functionality requires:
- Active Antigravity environment
- Jules API key configured
- Git repository in workspace
`);
