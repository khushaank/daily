const movements=new WeakMap();

// Move the existing cards, then animate from their previous positions (FLIP).
export function reorderTaskCards(list,ids,animate=true){
  if(!list)return;
  const cards=[...list.children].filter(el=>el.dataset.taskId);
  const byId=new Map(cards.map(card=>[card.dataset.taskId,card]));
  const ordered=ids.map(id=>byId.get(id)).filter(Boolean);
  if(ordered.length!==cards.length||ordered.every((card,i)=>card===cards[i]))return;
  const focused=list.ownerDocument?.activeElement;
  const keepFocus=focused&&list.contains(focused);
  const before=new Map(cards.map(card=>[card,animate?card.getBoundingClientRect().top:0]));
  cards.forEach(card=>movements.get(card)?.cancel());
  ordered.forEach(card=>list.appendChild(card));
  if(keepFocus&&list.ownerDocument.activeElement!==focused)focused.focus({preventScroll:true});
  if(!animate)return;
  cards.forEach(card=>{
    const delta=before.get(card)-card.getBoundingClientRect().top;
    if(!delta||!card.animate)return;
    const animation=card.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:430,easing:'cubic-bezier(.22,1,.36,1)'});
    movements.set(card,animation);
  });
}
