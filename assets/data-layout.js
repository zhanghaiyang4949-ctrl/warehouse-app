/* Keep the existing nodes and handlers, move only the offline panel's location. */
(function(){
 function install(){
  const box=document.querySelector('.github-version-box20261023');
  const safety=document.getElementById('data_safetyW106');
  if(box&&safety)safety.prepend(box);
  const tools=document.getElementById('dataManageTools');
  tools?.querySelector('.dataThreeBtnLine')?.classList.add('data-status-four');
  for(const button of document.querySelectorAll('#queryManageCardV72 button')){
   if(['saveQueryPasswordV72()','syncQueryDataNowV73(true)','exportQueryDataV72()','saveQuerySettingsV73()'].includes(button.getAttribute('onclick')))button.parentElement.classList.add('query-actions-equal');
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
