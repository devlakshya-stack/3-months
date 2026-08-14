/* Satviki Co-op Booth: browser-to-browser WebRTC photo booth. */
window.CoopBooth = (() => {
  const $ = id => document.getElementById(id);
  let peer = null, conn = null, call = null, localStream = null, roomCode = '';
  let isHost = false, partnerPhoto = null, myPhoto = null, countdownBusy = false;
  const status = (text, live=false) => { $('coopStatus').textContent = text; document.querySelector('.coop-live-dot')?.classList.toggle('live', live); };
  const setRemote = stream => { $('remoteVideo').srcObject = stream; $('remotePlaceholder').hidden = true; };
  const setConn = c => {
    conn = c;
    conn.on('open', () => { status('connected', true); conn.send({type:'hello', name:'Satviki booth'}); });
    conn.on('data', handleData);
    conn.on('close', () => { status('partner left'); setRemote(null); });
    conn.on('error', () => status('connection issue'));
  };
  function makeCode(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
  function create(){
    if(!window.Peer){ alert('Co-op mode needs an internet connection.'); return; }
    isHost=true; roomCode=makeCode(); $('roomCode').value=roomCode; status('creating…');
    peer = new Peer('satviki-' + roomCode, {debug:0});
    peer.on('open', ()=>status('waiting', true));
    peer.on('connection', c => { setConn(c); ensureLocalCall(c.peer); });
    peer.on('call', answerCall);
    peer.on('error', e => status(e.type==='unavailable-id'?'try again':'connection issue'));
  }
  function join(){
    if(!window.Peer){ alert('Co-op mode needs an internet connection.'); return; }
    const code=$('roomCode').value.trim().toUpperCase();
    if(!code){ $('roomCode').focus(); return; }
    roomCode=code; isHost=false; status('joining…');
    peer = new Peer(undefined,{debug:0});
    peer.on('open', ()=>{ const c=peer.connect('satviki-'+roomCode,{reliable:true}); setConn(c); callPartner('satviki-'+roomCode); });
    peer.on('call', answerCall);
    peer.on('error', ()=>status('could not join'));
  }
  async function getLocal(){
    if(localStream) return localStream;
    try{ localStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false}); return localStream; }
    catch(e){ alert('Please allow camera access for the co-op booth. You can still use the normal single-camera booth.'); throw e; }
  }
  async function callPartner(id){
    try{ const s=await getLocal(); call=peer.call(id,s); call.on('stream',setRemote); }catch(e){}
  }
  async function ensureLocalCall(id){ try{ await callPartner(id); }catch(e){} }
  async function answerCall(incoming){
    try{ const s=await getLocal(); incoming.answer(s); call=incoming; incoming.on('stream',setRemote); }catch(e){}
  }
  function send(msg){ if(conn?.open) conn.send(msg); }
  function handleData(msg){
    if(!msg || !msg.type) return;
    if(msg.type==='filter') { if(window.CameraBooth?.setFilter) window.CameraBooth.setFilter(msg.filter,false); }
    if(msg.type==='capture') startSynchronizedCapture(false);
    if(msg.type==='photo'){ partnerPhoto=msg.data; if(isHost && myPhoto) composePair(myPhoto,partnerPhoto); }
    if(msg.type==='ping') send({type:'pong'});
  }
  async function startSynchronizedCapture(broadcast=true){
    if(countdownBusy) return; countdownBusy=true;
    if(broadcast) send({type:'capture'});
    await window.CameraBooth.captureNow();
    myPhoto=window.CameraBooth.getLastPhoto();
    if(myPhoto) send({type:'photo',data:myPhoto});
    if(isHost && partnerPhoto) composePair(myPhoto,partnerPhoto);
    countdownBusy=false;
  }
  function composePair(a,b){
    const ia=new Image(), ib=new Image(); let ready=0;
    // Use a simpler compositing pass after both images load.
    Promise.all([new Promise(r=>{ia.onload=()=>r()}),new Promise(r=>{ib.onload=()=>r()})]).then(()=>{
      const w=1200,h=820,pad=30,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fffaf5';x.fillRect(0,0,w,h);x.fillStyle='#5b2934';x.textAlign='center';x.font='500 30px Georgia';x.fillText('three months · together ♡',w/2,38);const pw=(w-pad*3)/2,ph=h-125;x.drawImage(ia,pad,65,pw,ph);x.drawImage(ib,pad*2+pw,65,pw,ph);x.fillStyle='#a85d69';x.font='italic 20px Georgia';x.fillText('made in the co-op booth',w/2,h-25);const data=c.toDataURL('image/jpeg',.92);window.CameraBooth?.showResult(data);window.CameraBooth?.setLastPhoto(data);const a=document.createElement('a');a.href=data;a.download='satviki-co-op-photo.png';a.click();
    });
  }
  function syncFilter(filter){ send({type:'filter',filter}); }
  function init(){
    $('createRoom').onclick=create; $('joinRoom').onclick=join;
    $('copyRoom').onclick=async()=>{ if($('roomCode').value) { try{await navigator.clipboard.writeText($('roomCode').value)}catch(e){} $('copyRoom').textContent='copied'; setTimeout(()=>$('copyRoom').textContent='copy',1200); } };
    window.addEventListener('beforeunload',()=>{localStream?.getTracks().forEach(t=>t.stop());peer?.destroy();});
  }
  return {init,syncFilter,startSynchronizedCapture};
})();
