(() => {
 const pallet = document.getElementById('palletInput');
 document.getElementById('clearInboundPallet').addEventListener('click', () => {
  pallet.value = '';
  pallet.dispatchEvent(new Event('input', { bubbles: true }));
 });

 const customer = document.getElementById('inCustomer');
 const lock = document.getElementById('customerUppercase');
 const preference = 'warehouseCustomerUppercase';
 try { lock.checked = localStorage.getItem(preference) === '1'; } catch {}
 let composing = false;
 function uppercase() {
  if (!lock.checked || composing) return;
  const text = customer.value.replace(/[a-z]/g, letter => letter.toUpperCase());
  if (text === customer.value) return;
  const { selectionStart, selectionEnd, selectionDirection } = customer;
  customer.value = text;
  customer.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
 }
 customer.addEventListener('compositionstart', () => { composing = true; });
 customer.addEventListener('compositionend', () => {
  composing = false;
  uppercase();
  updateInboundContext();
 });
 customer.addEventListener('input', event => { if (!event.isComposing) uppercase(); }, true);
 lock.addEventListener('change', () => {
  try { localStorage.setItem(preference, lock.checked ? '1' : '0'); } catch {}
  uppercase();
  updateInboundContext();
 });
 uppercase();
 updateInboundContext();
})();
