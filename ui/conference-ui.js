/* Conference views use the native room controller; ordinary chats keep their own lifecycle. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id),view=el('conferenceView'),dialog=el('conferenceDialog');
  let safeDefaults={provider:'custom_gateway',model:''},dialogEpoch=0;
  let visible=false,editing=false,dialogScope=null,renderFrame=null,lastState=null,dialogTrigger=null;
  const controller=AxionConference.createController({invoke,channel:()=>new window.__TAURI__.core.Channel(),onChange:update});
  const text=(tag,value,cls)=>{const node=document.createElement(tag);node.textContent=value;if(cls)node.className=cls;return node;};
  function update(state){lastState=state;if(renderFrame!==null)return;renderFrame=requestAnimationFrame(()=>{renderFrame=null;render(lastState);});}
  function render(state){
    const list=el('conferenceRooms'),focusedRoom=list.contains(document.activeElement)?document.activeElement.dataset.roomId:null;list.replaceChildren();
    for(const room of state.rooms){const button=text('button',room.topic);button.type='button';button.dataset.roomId=room.id;button.setAttribute('aria-current',String(visible&&state.room?.id===room.id));button.onclick=()=>openRoom(room.id);list.append(button);}
    if(!state.rooms.length)list.append(text('p','No rooms yet.'));
    if(focusedRoom)[...list.children].find(n=>n.dataset.roomId===focusedRoom)?.focus({preventScroll:true});
    el('conferenceSidebarError').textContent=visible?'':state.error;
    if(!visible)return;
    const room=state.room;el('conferenceTopic').textContent=room?.topic||'Conference room';
    el('conferenceError').textContent=state.error;el('btnEditConference').disabled=!room||state.busy||room.status==='running';
    el('btnConferenceSend').disabled=!room||state.busy||room.status==='running';
    el('btnConferenceStop').hidden=!state.busy;el('btnConferenceStop').disabled=state.stopping;
    el('conferenceStatus').textContent=state.busy?(state.stopping?'Stopping active and pending speakers...':'Round in progress...'):(room?`Saved locally | ${room.status} | Round ${room.round}`:'Loading room...');
    const roster=el('conferenceRoster');roster.replaceChildren();
    for(const p of room?.participants||[])roster.append(text('span',`${p.name} · @${p.id} · ${p.provider} / ${p.model}`));
    const transcript=el('conferenceTranscript'),nearBottom=transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<90,oldScroll=transcript.scrollTop;
    const expanded=new Set([...transcript.querySelectorAll('article')].filter(n=>n.querySelector('details[open]')).map(n=>n.dataset.entryId));
    const fragment=document.createDocumentFragment();
    for(const entry of room?.transcript||[]){
      const article=document.createElement('article');article.className='conference-entry';article.dataset.status=entry.status;article.dataset.entryId=entry.id;
      const header=document.createElement('header');header.append(text('strong',entry.speaker_name||'You'),text('span',entry.kind==='user'?'You':`${entry.provider} / ${entry.model}`),text('span',entry.status));article.append(header);
      const content=document.createElement('div');content.className='message-content';content.dir='auto';content.innerHTML=marked.parse(entry.content||'');article.append(content);
      if(entry.thinking){const details=document.createElement('details');details.open=expanded.has(entry.id);details.append(text('summary','Model reasoning'),text('pre',entry.thinking));article.append(details);}
      if(entry.error)article.append(text('p',entry.error,'conference-entry-error'));fragment.append(article);
    }
    if(room&&!room.transcript.length)fragment.append(text('p','Start a round to discuss this topic. Only this room’s transcript is shared.'));
    transcript.replaceChildren(fragment);if(nearBottom)transcript.scrollTop=transcript.scrollHeight;else transcript.scrollTop=oldScroll;
  }
  async function openRoom(id){visible=true;activeMode='conference';activeId=id;activeAgentId='';++historyLoadEpoch;
    view.hidden=false;view.parentElement.classList.add('conference-active');document.getElementById('sidebar').classList.remove('open');
    await controller.open(id);if(visible&&!dialog.open)el('conferenceInput').focus();}
  function leave(){visible=false;view.hidden=true;view.parentElement.classList.remove('conference-active');update(controller.state());}
  function defaults(){return safeDefaults;}
  async function openDialog(edit=false){
    const ticket=++dialogEpoch;editing=edit;dialogTrigger=document.activeElement;el('conferenceDialogError').textContent='';
    el('conferenceDialogTitle').textContent=edit?'Edit participants':'Create conference room';el('btnSaveConference').textContent=edit?'Save participants':'Create room';
    el('conferenceTopicInput').disabled=edit;el('conferenceTopicInput').value=edit?controller.state().room.topic:'';
    el('conferenceParticipantOptions').replaceChildren();dialog.showModal();el('btnSaveConference').disabled=true;
    try{
      await controller.refresh();dialogScope=controller.state().scope;
      const config=await invoke('get_conference_options');safeDefaults={provider:config.provider,model:config.default_model};
      const available=await invoke('get_personas');if(ticket!==dialogEpoch||!dialog.open)return;const selected=edit?controller.state().room?.participants||[]:[];
      const options=available.map(p=>({...p}));options.push({id:'__hermes__',name:'Hermes (Personal Agent)',model:defaults().model});
      for(const p of options){const prior=selected.find(s=>s.id===p.id),row=document.createElement('div');row.className='conference-participant-option';row.dataset.participantId=p.id;
        const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=!!prior;check.value=p.id;
        label.append(check,document.createTextNode(p.name),text('small','@'+p.id));row.append(label);
        const provider=document.createElement('select');provider.setAttribute('aria-label',`Provider for ${p.name}`);
        for(const id of ['hermes_local','custom_gateway','openai','openrouter','groq','gemini']){const option=text('option',id);option.value=id;provider.append(option);}provider.value=prior?.provider||defaults().provider;row.append(provider);
        const model=document.createElement('input');model.setAttribute('list','conferenceModels');model.setAttribute('aria-label',`Exact model for ${p.name}`);model.placeholder='Exact model ID';model.value=prior?.model||p.model||defaults().model||'';
        provider.disabled=model.disabled=!check.checked;check.onchange=()=>{provider.disabled=model.disabled=!check.checked;};row.append(model);el('conferenceParticipantOptions').append(row);
      }
      el('btnSaveConference').disabled=false;
      if(!edit)el('conferenceTopicInput').focus();
      invoke('get_connected_hermes_models').then(models=>{el('conferenceModels').replaceChildren(...models.map(m=>{const option=document.createElement('option');option.value=m.id;return option;}));}).catch(()=>{});
    }catch(e){el('conferenceDialogError').textContent=String(e);}
  }
  function closeDialog(){++dialogEpoch;dialog.close();dialogTrigger?.focus();}
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  el('conferenceForm').onsubmit=async event=>{event.preventDefault();el('btnSaveConference').disabled=true;el('conferenceDialogError').textContent='';
    try{if(await invoke('get_chat_storage_scope')!==dialogScope)throw Error('Storage changed. Close and reopen this dialog.');
      const participants=[...el('conferenceParticipantOptions').children].filter(row=>row.querySelector('[type=checkbox]').checked).map(row=>({id:row.dataset.participantId,provider:row.querySelector('select').value,model:row.querySelector('input[list]').value.trim()}));
      if(!participants.length)throw Error('Select at least one participant.');if(participants.some(p=>!p.model))throw Error('Enter an exact model for every selected participant.');
      if(await controller.save(el('conferenceTopicInput').value.trim(),participants,editing)){closeDialog();await openRoom(controller.state().room.id);}else el('conferenceDialogError').textContent=controller.state().error;
    }catch(e){el('conferenceDialogError').textContent=String(e);}finally{el('btnSaveConference').disabled=false;}};
  async function send(){const input=el('conferenceInput'),draft=input.value;if(!draft.trim())return;
    if(await controller.send(draft.trim())){if(input.value===draft)input.value='';}}
  el('btnConferenceSend').onclick=send;el('btnConferenceStop').onclick=()=>controller.stop();
  el('conferenceInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
  el('btnNewConference').onclick=()=>openDialog();el('btnEditConference').onclick=()=>openDialog(true);el('btnCancelConference').onclick=closeDialog;
  window.AxionConferenceUI={leave,openRoom,controller};
  controller.refresh();window.addEventListener('focus',()=>controller.refresh());
  // Refresh saved rooms after storage/restore settings have settled, without polling transcripts.
  setInterval(()=>controller.refresh(),15000);
  // A WebView reload detaches its channel, but the native round continues durably.
  setInterval(()=>{const state=controller.state();if(state.busy&&!state.streamAttached)controller.refresh();},500);
})();
