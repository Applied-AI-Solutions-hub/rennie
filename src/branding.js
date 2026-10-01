// Presentation branding. Keep identity/storage IDs independent of this file.
((root)=>{
 const brand=Object.freeze({
  productName:'Rennie',
  hostName:'Rennie Host',
  clientName:'Rennie Client',
  maker:'Applied AI Solutions',
  tagline:'Your agent. Your devices. Connected.',
  namingStatus:'Rennie — by Applied AI Solutions',
  shortlist:Object.freeze(['Rennie']),
 });
 if(typeof module!=='undefined'&&module.exports)module.exports=brand;
 else root.productBrand=brand;
})(typeof window!=='undefined'?window:globalThis);
