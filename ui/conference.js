(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AxionConference=api;})(globalThis,function(){
  'use strict';
  function createController({invoke,channel,requestId=()=>crypto.randomUUID(),onChange=()=>{}}){
    let scope=null,rooms=[],room=null,error='',active=null,remoteStopping=false,epoch=0,refreshEpoch=0;
    const state=()=>({scope,rooms,room,error,busy:!!active||room?.status==='running',stopping:!!active?.stopping||remoteStopping,streamAttached:!!active,activeRoomId:active?.roomId||(room?.status==='running'?room.id:null)});
    const notify=()=>onChange(state());
    const accept=(value,expectedScope)=>{if(!value||scope!==expectedScope)return;if(room?.id===value.id)room=value;
      const index=rooms.findIndex(r=>r.id===value.id);if(index<0)rooms.unshift(value);else rooms[index]=value;notify();};
    async function refresh(){const ticket=++refreshEpoch;try{const next=await invoke('get_chat_storage_scope');
      if(ticket!==refreshEpoch)return;
      if(scope!==next){room=null;rooms=[];remoteStopping=false;scope=next;++epoch;notify();}
      const list=await invoke('list_conference_rooms',{scope:next});if(ticket!==refreshEpoch)return;
      rooms=list;if(room&&!active)room=rooms.find(r=>r.id===room.id)||null;if(room?.status!=='running')remoteStopping=false;notify();
    }catch(e){if(ticket===refreshEpoch){error=String(e);notify();}}}
    async function open(id){const ticket=++epoch,origin=scope;error='';room=null;notify();
      try{const value=await invoke('get_conference_room',{roomId:id,scope:origin});if(ticket===epoch&&scope===origin){const recent=rooms.find(r=>r.id===id);room=recent&&Date.parse(recent.updated_at)>Date.parse(value.updated_at)?recent:value;notify();}}
      catch(e){if(ticket===epoch){error=String(e);notify();}}}
    async function save(topic,participants,editing=false){const origin=scope;error='';
      try{const value=await invoke(editing?'update_conference_participants':'create_conference_room',editing?
        {roomId:room.id,participants,scope:origin}:{topic,participants,scope:origin});
        if(scope!==origin)throw Error('Storage changed. Reopen the original storage folder to view this room.');
        ++epoch;room=value;accept(value,origin);return true;
      }catch(e){error=String(e);notify();return false;}}
    async function send(message){if(active||!room||room.status==='running'||!message.trim())return false;
      const run={scope,roomId:room.id,requestId:requestId(),stopping:false};active=run;error='';notify();
      const onEvent=channel();onEvent.onmessage=event=>{if(active===run&&event.type==='room')accept(event.room,run.scope);};
      try{const value=await invoke('stream_conference_round',{roomId:run.roomId,scope:run.scope,requestId:run.requestId,message,onEvent});accept(value,run.scope);return true;}
      catch(e){if(scope===run.scope){error=String(e);notify();}return false;}finally{if(active===run){active=null;notify();}}}
    async function stop(){const run=active||(room?.status==='running'&&room.active_request_id?{scope,roomId:room.id,requestId:room.active_request_id}:null);if(!run)return;
      if(active)run.stopping=true;else remoteStopping=true;notify();
      try{await invoke('cancel_conference_round',{roomId:run.roomId,scope:run.scope,requestId:run.requestId});}
      catch(e){run.stopping=false;remoteStopping=false;error='Stop failed: '+String(e);notify();}}
    return {state,refresh,open,save,send,stop};
  }
  return {createController};
});
