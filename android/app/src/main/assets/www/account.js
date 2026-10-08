import {createClient} from './vendor/supabase.js';
import {supabaseConfig as config} from './supabase-config.js';

function publicConfiguration() {
  try {
    const url = new URL(config.url);
    const key = config.publishableKey.trim();
    if (url.protocol !== 'https:' || !key) return false;
    if (key.startsWith('sb_secret_')) return false;
    // Legacy anon JWTs are supported; service_role JWTs are never safe in a client.
    if (!key.startsWith('sb_publishable_')) {
      const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.role !== 'anon') return false;
    }
    return true;
  } catch { return false; }
}
export const client = publicConfiguration() ? createClient(config.url, config.publishableKey, {
  global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)})},
  auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
}) : null;

export async function googleSignIn() {
  if (!client) throw Error('Google sign-in is being set up. You can use this device for now.');
  const native = !!window.DailyNative?.openAuth;
  const redirectTo = native ? config.androidRedirectUrl : config.redirectUrl || location.origin + location.pathname;
  const {data,error} = await client.auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:native}});
  if (error) throw error;
  if (native) window.DailyNative.openAuth(data.url);
}
export async function signOut() {
  if (!client) return;
  const {error} = await client.auth.signOut({scope:'local'});
  if (error) throw error;
}
export function watchAccount(onUser, onError) {
  if (!client) { onUser(null); return; }
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  let exchanging = !!code, sequence = 0, failedExchange = false;
  let callbackError = params.has('error') ? 'Google sign-in was cancelled or could not be completed.' : null;
  const clearCallback = () => {
    for(const key of ['code','error','error_description','error_code'])params.delete(key);
    history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():'')+location.hash);
  };
  const failed = error => { exchanging=false; failedExchange=true; clearCallback(); onError(error); };
  client.auth.onAuthStateChange((_event, session) => {
    const current = ++sequence;
    // SDK auth callbacks hold a lock: database work must run after they return.
    setTimeout(() => {
      if(current !== sequence || exchanging) return;
      if(session?.user) { failedExchange=false; onUser(session.user); }
      else if(callbackError) {const message=callbackError;callbackError=null;clearCallback();onError(Error(message));}
      else if(!failedExchange) onUser(null);
    }, 0);
  });
  window.dailyAuthCallback = async url => {
    try {
      const callback = new URL(url);
      if (callback.protocol !== 'mydailybrief:' || callback.host !== 'auth' || callback.pathname !== '/callback') return;
      if(callback.searchParams.get('error')) throw Error('Google sign-in was cancelled or could not be completed.');
      const code = callback.searchParams.get('code');
      if (!code) throw Error('The sign-in link is missing its code. Try signing in again.');
      const {error} = await client.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } catch(error) { onError(error); }
  };
  window.DailyNative?.authReady?.();
  if(code)client.auth.exchangeCodeForSession(code).then(({data,error})=>{if(error){failed(error);return;}exchanging=false;failedExchange=false;clearCallback();onUser(data.user);}).catch(failed);
}
