(function(root){
 'use strict';const tools=root.WarehouseTailCollisions;let groups=tools.build([]);
 function badge(info){return '<span class="tail-collision-badge">同托盘尾号 '+esc(info.tail)+' 重复 · '+info.count+' 件，请核对完整单号</span>';}
 const card=root.renderFindCardV49;
 root.renderFindCardV49=function(x){let html=card(x);const info=tools.info(groups,x);if(!info)return html;html=html.replace('findResultCard ','findResultCard tail-collision tail-collision-'+info.color+' ');return html.replace('<div class="findResultLeft">','<div class="findResultLeft">'+badge(info));};
 const render=root.renderStoredFindResultsV49;root.renderStoredFindResultsV49=function(){groups=tools.build(db.items);return render.apply(this,arguments);};
 const pallet=root.renderPalletItemsV51;root.renderPalletItemsV51=function(){const value=pallet.apply(this,arguments),index=tools.build(db.items),byId=new Map(db.items.map(x=>[String(x.id),x]));document.querySelectorAll('[data-pallet-id]').forEach(row=>{const info=tools.info(index,byId.get(row.dataset.palletId));if(info){row.classList.add('tail-collision','tail-collision-'+info.color);row.cells[0].insertAdjacentHTML('beforeend',badge(info));}});return value;};
})(window);
