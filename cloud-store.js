// One document per account, with optimistic revision checks to avoid silent overwrites.
export function createCloudStore({client,userId,storage,apply,status,cacheKey}) {
  const metaKey = `daily-cloud-meta:${userId}`;
  let meta = {revision:0,dirty:false}, pending = null, conflict = null;
  let disposed = false, running = null, timer, editNumber = 0;
  try { meta = {...meta,...JSON.parse(storage.getItem(metaKey) || '{}')}; } catch {}
  const persist = () => { storage.setItem(metaKey,JSON.stringify(meta)); };
  const signal = (message,kind='idle') => { if(!disposed) status(message,kind); };
  async function readRemote() {
    const {data,error} = await client.from('daily_plans').select('document,revision,updated_at').eq('user_id',userId).maybeSingle();
    if(error) throw error;
    return data;
  }
  function cache(document) { storage.setItem(cacheKey,JSON.stringify(document)); }
  function receive(row) {
    const document = row?.document;
    meta = {revision:row?.revision || 0,dirty:false};
    if(document) { cache(document); apply(document); }
    persist();
  }
  async function reconcile() {
    const remote = await readRemote();
    if(disposed) return;
    if(meta.dirty) {
      if((remote?.revision || 0) !== meta.revision) {
        conflict = remote || {revision:0,document:null};
        signal('Two copies have changes. Choose which to keep.','conflict');
        return;
      }
      pending = JSON.parse(storage.getItem(cacheKey));
    } else if((remote?.revision || 0) !== meta.revision) {
      receive(remote);
    } else if(remote && !storage.getItem(cacheKey)) {
      receive(remote);
    }
    if(!pending) signal(remote ? 'All your little wins are synced' : 'Ready for your first little win','synced');
  }
  async function writePending() {
    while(pending && !conflict && !disposed) {
      const document = pending, number = editNumber;
      signal('Saving your little wins…','saving');
      const {data,error} = await client.rpc('save_daily_plan',{
        p_user_id:userId,p_document:document,p_expected_revision:meta.revision,
      });
      if(error) throw error;
      if(disposed) return;
      const row = data?.[0];
      if(!row) {
        conflict = await readRemote() || {revision:0,document:null};
        signal('Two copies have changes. Choose which to keep.','conflict');
        return;
      }
      meta.revision = row.revision;
      if(number === editNumber) { pending = null; meta.dirty = false; }
      persist();
    }
    if(!conflict && !disposed) signal('All your little wins are synced','synced');
  }
  function run(recheck=false) {
    if(disposed) return Promise.resolve();
    if(running) return running;
    running = (async () => {
      try {
        if(recheck) await reconcile();
        if(!disposed && !conflict) await writePending();
      } catch { signal('Saved on this device. Cloud sync needs a retry.','offline'); }
      finally { running = null; }
    })();
    return running;
  }
  return {
    start:() => run(true),
    save(document) {
      pending = structuredClone(document); editNumber++; meta.dirty = true;
      try { persist(); } catch { signal('Device storage is full. Export a backup.','offline'); return; }
      if(conflict) return;
      signal('Saved on this device · waiting to sync','saving');
      clearTimeout(timer); timer = setTimeout(() => run(),650);
    },
    retry:() => run(true),
    async resolve(choice) {
      if(!conflict || disposed) return;
      if(choice === 'cloud') {
        if(!conflict.document) throw Error('The cloud copy is empty. Keep this device or export your backup first.');
        receive(conflict); pending = null; conflict = null;
        signal('Cloud copy restored','synced');
      } else {
        meta.revision = conflict.revision; meta.dirty = true;
        pending = JSON.parse(storage.getItem(cacheKey));
        conflict = null; persist(); await run();
      }
    },
    dispose() { disposed = true; clearTimeout(timer); },
  };
}
