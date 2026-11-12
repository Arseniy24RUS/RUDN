import {mountReceptionAI} from './app.js';
const root=document.getElementById('receptionAI');
const parameters=new URLSearchParams(location.search);
const locale=/^(ru|en|zh)$/.test(parameters.get('lang')||'')?parameters.get('lang'):'ru';
document.documentElement.lang=locale;
// No credentials, API keys, private cases, or provider requests live in this page.
// The loopback-only development server supplies the same public protocol as production.
await mountReceptionAI(root,{locale,studentKey:'local-demo',showLanguageSelector:true,context:'free',assessmentAllowed:false},
  {endpoint:'/api/reception',demo:true});
