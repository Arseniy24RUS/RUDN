import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../site/assets/js/config.js';
import {diagnosticIdentityAllowed} from '../site/assets/js/diagnostics-cloud-policy.js';
import {handle} from '../firebase/functions/gateway.mjs';

test('background diagnostic identity matches the actual production gateway origin policy',async()=>{
  for(const href of [CONFIG.pagesUrl,CONFIG.pagesUrl+'apps/legal-lab/demo.html','https://preview.example.test/RUDN/','http://127.0.0.1:8765/apps/legal-lab/demo.html','http://localhost:8765/','http://arseniy24rus.github.io/RUDN/']){
    let upstreamCalls=0;
    const response=await handle(new Request('https://gateway.internal/firebase/auth/v1/accounts:signUp?key='+encodeURIComponent(CONFIG.firebase.apiKey),{
      method:'OPTIONS',headers:{Origin:new URL(href).origin,'Access-Control-Request-Method':'POST'}
    }),{fetchImpl:async()=>{upstreamCalls++;throw Error('Unexpected upstream call');}});
    assert.equal(diagnosticIdentityAllowed(CONFIG,href),response.status===204,href);
    assert.equal(upstreamCalls,0,'Origin preflight never calls Firebase');
  }
});

test('explicitly configured loopback emulators retain local diagnostic identity',()=>{
  const config={...CONFIG,emulators:{auth:'http://127.0.0.1:9099',host:'127.0.0.1',databasePort:9000}};
  for(const href of ['http://127.0.0.1:8765/','http://localhost:8765/','http://[::1]:8765/'])assert.equal(diagnosticIdentityAllowed(config,href),true);
  assert.equal(diagnosticIdentityAllowed(CONFIG,'http://127.0.0.1:8765/'),false);
  assert.equal(diagnosticIdentityAllowed(config,'https://preview.example.test/'),false);
  assert.equal(diagnosticIdentityAllowed({...config,emulators:{...config.emulators,auth:'https://identitytoolkit.googleapis.com/'}},'http://localhost:8765/'),false);
  assert.equal(diagnosticIdentityAllowed({...CONFIG,emulators:{}},'http://localhost:8765/'),false);
});

test('malformed/opaque URLs and credentials never enable background cloud identity',()=>{
  for(const href of [undefined,'not-a-url','file:///C:/demo.html','data:text/html,fixture','https://user:password@arseniy24rus.github.io/RUDN/'])assert.equal(diagnosticIdentityAllowed(CONFIG,href),false);
  assert.equal(diagnosticIdentityAllowed({},CONFIG.pagesUrl),false);
});
