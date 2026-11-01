// Reading an email link only prepares this native form. Only its button posts.
(() => {
 const form=document.querySelector('#join-decision');if(!form)return;
 const params=new URLSearchParams(location.hash.slice(1));
 history.replaceState(null,'',location.pathname+location.search);
 const token=params.get('token')||'',action=params.get('action');
 const title=document.querySelector('#decision-title'),status=document.querySelector('#decision-status');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)||!['approve','decline'].includes(action)){
  title.textContent='This request link is unavailable.';status.textContent='Open the original link from your email to continue.';return;
 }
 const endpoint=(document.documentElement.dataset.directoryApi||'').replace(/bookish-directory(?:\?.*)?$/,'bookish-join-respond');
 if(!endpoint){status.textContent='Please try again soon.';return;}
 form.action=endpoint;
 form.elements.token.value=token;form.elements.action.value=action;
 title.textContent=action==='approve'?'Welcome this reader?':'Decline this request?';
 form.querySelector('button').textContent=action==='approve'?'Welcome reader':'Decline request';
 form.querySelector('button').disabled=false;form.hidden=false;
 status.textContent='Confirm your choice to update the request.';
})();
