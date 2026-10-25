// Vendored from pollen-robotics/microduck-simulator, app/src/game/signed.js,
// revision ad9d41a763f30dc770817c33d92dcfec0205db1e (Apache License 2.0, see
// ./LICENSE and ./PROVENANCE.md). Modifications for Kestrel: none.
// Private HF Space auth: the hub iframe URL carries a ?__sign JWT, but
// subresource requests normally rely on a *.static.hf.space cookie that
// browsers often block inside the iframe (third-party cookie blocking),
// which 401s every same-origin fetch. Appending the JWT to each request
// authenticates them regardless of cookie policy. No-op locally.
//
// Only ASSET requests (meshes, policies, XML, audio, images) go through
// this now: application code ships in the Vite bundle, which the page load
// itself already authenticated.
const HF_SIGN = new URLSearchParams(location.search).get("__sign");

export const signed = (url) =>
  HF_SIGN ? `${url}${url.includes("?") ? "&" : "?"}__sign=${encodeURIComponent(HF_SIGN)}` : url;
