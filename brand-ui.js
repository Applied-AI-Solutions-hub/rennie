(()=>{
 const apply=()=>{const b=window.productBrand;document.title=b.productName;document.querySelectorAll('[data-brand]').forEach(e=>{
  const value=b[e.dataset.brand];if(typeof value==='string')e.textContent=value;
 });};
 window.applyProductBrand=apply;
 apply();
})();
